import * as x509 from "@peculiar/x509";
import { Convert } from "pvtsutils";
import * as React from "react";

const CA_DB_NAME = "ca-db";
const CA_STORE_NAME = "ca-store";

export interface CaObject {
  id: string;
  name: string;
  cert: string;
  key: CryptoKey;
}
export class CaDataBase {
  private dbName: string;
  private storeName: string;
  private version: number;

  constructor() {
    this.dbName = CA_DB_NAME;
    this.storeName = CA_STORE_NAME;
    this.version = 1;
  }

  async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const openReq = indexedDB.open(this.dbName, this.version);

      openReq.onupgradeneeded = (event: any) => {
        const db: IDBDatabase = event.target.result;
        db.createObjectStore(this.storeName, { keyPath: "id" });
      };

      openReq.onsuccess = (event: any) => resolve(event.target.result);
      openReq.onerror = () => reject(new Error("Failed to open database"));
    });
  }

  async addObject(object: CaObject): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, "readwrite");
    const store = transaction.objectStore(this.storeName);
    store.add(object);
  }

  async getObjectByKey(key: string): Promise<CaObject> {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, "readonly");
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to get object"));
    });
  }

  async deleteObjectByKey(key: string): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, "readwrite");
    const store = transaction.objectStore(this.storeName);
    store.delete(key);
  }

  async deleteTable(): Promise<void> {
    const deleteReq = indexedDB.deleteDatabase(this.dbName);
    return new Promise((resolve, reject) => {
      deleteReq.onsuccess = () => resolve();
      deleteReq.onerror = () => reject(new Error("Failed to delete database"));
    });
  }
}

export type CertificateProfile =
  | "none"
  | "code_signing"
  | "smime"
  | "pdf_signing"
  | "cms_encryption";

export interface CaEnrolParams {
  subject: string;
  validity: number;
  profile: CertificateProfile;
}

export interface CaContextProps {
  name: string;
  value?: CaObject;
  // actions
  initialize(name: string, algorithm: string): void;
  remove(): void;
  download(): void;
  enrollCertificate(
    key: x509.PublicKey,
    params: CaEnrolParams
  ): Promise<x509.X509Certificate>;
}

export const CaContext = React.createContext<CaContextProps | undefined>(
  undefined
);

interface CaProviderProps {
  name: string;
  children: React.ReactNode;
}

export const CaProvider: React.FC<CaProviderProps> = (params) => {
  const [value, setValue] = React.useState<CaObject | undefined>();
  const db = new CaDataBase();

  React.useEffect(() => {
    // load ca from db
    (async () => {
      await db.openDB();
      const ca = await db.getObjectByKey(params.name);
      if (ca) {
        setValue(ca);
      }
    })();
  }, []);

  const context: CaContextProps = {
    name: params.name,
    value,
    initialize: (name: string, algorithm: string) => {
      (async () => {
        let alg: RsaHashedKeyGenParams | (EcKeyGenParams & { hash: string });
        switch (algorithm) {
          case "rsa2048":
            alg = {
              name: "RSASSA-PKCS1-v1_5",
              hash: "SHA-256",
              modulusLength: 2048,
              publicExponent: new Uint8Array([1, 0, 1]),
            };
            break;
          case "rsa4096":
            alg = {
              name: "RSASSA-PKCS1-v1_5",
              hash: "SHA-256",
              modulusLength: 4096,
              publicExponent: new Uint8Array([1, 0, 1]),
            };
            break;
          case "ecp256":
            alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
            break;
          case "ecp384":
            alg = { name: "ECDSA", namedCurve: "P-384", hash: "SHA-384" };
            break;
          case "ecp521":
            alg = { name: "ECDSA", namedCurve: "P-521", hash: "SHA-512" };
            break;
          default:
            throw new Error(`Unsupported algorithm: ${algorithm}`);
        }
        const keys = await crypto.subtle.generateKey(alg, false, [
          "sign",
          "verify",
        ]);
        const serial = crypto.getRandomValues(new Uint8Array(16));
        serial[0] &= 0x7f;
        if (serial[0] === 0) {
          serial[1] |= 0x80;
        }
        const cert = await x509.X509CertificateGenerator.createSelfSigned({
          serialNumber: Convert.ToHex(serial),
          name,
          notBefore: new Date(),
          notAfter: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 3), // 3 years
          keys,
          signingAlgorithm: alg,
          extensions: [
            new x509.BasicConstraintsExtension(true, 0, true),
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
              true
            ),
            await x509.AuthorityKeyIdentifierExtension.create(keys.publicKey),
            await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
          ],
        });

        const pem = cert.toString("pem");
        const obj = {
          id: params.name,
          name,
          cert: pem,
          key: keys.privateKey,
        };
        await db.addObject(obj);
        setValue(obj);
      })();
    },
    remove: () => {
      (async () => {
        await db.deleteObjectByKey(params.name);
        setValue(undefined);
      })();
    },
    download: () => {
      if (value) {
        (async () => {
          const cert = new x509.X509Certificate(value.cert);
          const thumbprint = await cert.getThumbprint();
          const blob = new Blob([cert.toString("pem")], {
            type: "application/x-x509-ca-cert",
          });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${Convert.ToHex(thumbprint)}.pem`;
          a.click();
          window.URL.revokeObjectURL(url);
        })();
      }
    },
    enrollCertificate: async (key: x509.PublicKey, params: CaEnrolParams) => {
      if (!value) {
        throw new Error("CA is not initialized");
      }

      const caCert = new x509.X509Certificate(value.cert);

      const serial = crypto.getRandomValues(new Uint8Array(16));
      serial[0] &= 0x7f;
      if (serial[0] === 0) {
        serial[1] |= 0x80;
      }

      const certParams: x509.X509CertificateCreateParams = {
        serialNumber: Convert.ToHex(serial),
        subject: params.subject,
        issuer: caCert.subject,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 1000 * 60 * 60 * 24 * params.validity),
        signingAlgorithm: {
          hash: "SHA-256",
          ...caCert.publicKey.algorithm,
        },
        publicKey: key,
        signingKey: value.key,
        extensions: [
          new x509.BasicConstraintsExtension(false, undefined, true),
          await x509.AuthorityKeyIdentifierExtension.create(caCert),
          await x509.SubjectKeyIdentifierExtension.create(key),
        ],
      };
      const extensions = certParams.extensions || [];
      switch (params.profile) {
        case "code_signing":
          extensions.push(
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.digitalSignature,
              true
            )
          );
          extensions.push(
            new x509.ExtendedKeyUsageExtension([
              x509.ExtendedKeyUsage.codeSigning,
            ])
          );
          break;
        case "smime":
          const name = new x509.Name(params.subject);
          const email = name.getField("E");
          if (!email.length) {
            throw new Error("Subject must contain an email field (E)");
          }
          extensions.push(
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.digitalSignature |
                x509.KeyUsageFlags.keyEncipherment |
                x509.KeyUsageFlags.nonRepudiation,
              true
            )
          );
          extensions.push(
            new x509.ExtendedKeyUsageExtension([
              x509.ExtendedKeyUsage.emailProtection,
            ])
          );
          extensions.push(
            new x509.SubjectAlternativeNameExtension([
              {
                type: "email",
                value: email[0],
              },
            ])
          );
          break;
        case "pdf_signing":
          extensions.push(
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.digitalSignature,
              true
            )
          );
          extensions.push(
            new x509.ExtendedKeyUsageExtension(["1.2.840.113583.1.1.10"])
          ); // Adobe PDF
          break;
        case "cms_encryption":
          extensions.push(
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.keyEncipherment |
                x509.KeyUsageFlags.dataEncipherment,
              true
            )
          );
          extensions.push(
            new x509.ExtendedKeyUsageExtension(["1.3.6.1.4.1.311.80.1"])
          ); // Document Encryption
          break;
        default:
          extensions.push(
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.digitalSignature,
              true
            )
          );
          break;
      }

      const cert = await x509.X509CertificateGenerator.create(certParams);

      return cert;
    },
  };

  return (
    <CaContext.Provider value={context}>{params.children}</CaContext.Provider>
  );
};

export const useCaContext = () => {
  const context = React.useContext(CaContext);
  if (context === undefined) {
    throw new Error("useCaContext must be used within a CaProvider");
  }
  return context;
};

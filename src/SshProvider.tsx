import * as ssh from "@peculiar/ssh";
import { Convert } from "pvtsutils";
import * as React from "react";

const SSH_CA_DB_NAME = "ssh-ca-db";
const SSH_CA_STORE_NAME = "ssh-ca-store";

export interface SshCaObject {
  id: string;
  name: string;
  publicKey: string;
  privateKey: CryptoKey;
  keyType: string;
}

export class SshCaDataBase {
  private dbName: string;
  private storeName: string;
  private version: number;

  constructor() {
    this.dbName = SSH_CA_DB_NAME;
    this.storeName = SSH_CA_STORE_NAME;
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
      openReq.onerror = () => reject(new Error("Failed to open SSH CA database"));
    });
  }

  async addObject(object: SshCaObject): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, "readwrite");
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.add(object);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to add SSH CA object"));
    });
  }

  async getObjectByKey(key: string): Promise<SshCaObject> {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, "readonly");
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to get SSH CA object"));
    });
  }

  async deleteObjectByKey(key: string): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, "readwrite");
    const store = transaction.objectStore(this.storeName);
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete SSH CA object"));
    });
  }

  async deleteTable(): Promise<void> {
    const deleteReq = indexedDB.deleteDatabase(this.dbName);
    return new Promise((resolve, reject) => {
      deleteReq.onsuccess = () => resolve();
      deleteReq.onerror = () => reject(new Error("Failed to delete SSH CA database"));
    });
  }
}

export type SshCertificateType = "user" | "host";

export interface SshEnrollParams {
  principals: string[];
  validAfter: Date;
  validBefore: Date;
  certType: SshCertificateType;
  keyId: string;
}

export interface SshCaContextProps {
  name: string;
  value?: SshCaObject;
  // actions
  initialize(name: string, algorithm: string): void;
  remove(): void;
  download(): void;
  enrollCertificate(
    publicKey: string,
    params: SshEnrollParams
  ): Promise<string>;
}

export const SshCaContext = React.createContext<SshCaContextProps | undefined>(
  undefined
);

interface SshProviderProps {
  name: string;
  children: React.ReactNode;
}

export const SshProvider: React.FC<SshProviderProps> = (params) => {
  const [value, setValue] = React.useState<SshCaObject | undefined>();
  const db = new SshCaDataBase();

  React.useEffect(() => {
    // load SSH CA from db
    (async () => {
      try {
        await db.openDB();
        const sshCa = await db.getObjectByKey(params.name);
        if (sshCa) {
          setValue(sshCa);
        }
      } catch (error) {
        // SSH CA doesn't exist, that's normal
      }
    })();
  }, []);

  const context: SshCaContextProps = {
    name: params.name,
    value,
    initialize: (name: string, algorithm: string) => {
      (async () => {
        let alg: RsaHashedKeyGenParams | EcKeyGenParams | { name: string; };
        let keyType: string;

        switch (algorithm) {
          case "rsa2048":
            alg = {
              name: "RSASSA-PKCS1-v1_5",
              hash: "SHA-256",
              modulusLength: 2048,
              publicExponent: new Uint8Array([1, 0, 1]),
            };
            keyType = "ssh-rsa";
            break;
          case "rsa4096":
            alg = {
              name: "RSASSA-PKCS1-v1_5",
              hash: "SHA-256",
              modulusLength: 4096,
              publicExponent: new Uint8Array([1, 0, 1]),
            };
            keyType = "ssh-rsa";
            break;
          case "ecp256":
            alg = { name: "ECDSA", namedCurve: "P-256" };
            keyType = "ecdsa-sha2-nistp256";
            break;
          case "ecp384":
            alg = { name: "ECDSA", namedCurve: "P-384" };
            keyType = "ecdsa-sha2-nistp384";
            break;
          case "ecp521":
            alg = { name: "ECDSA", namedCurve: "P-521" };
            keyType = "ecdsa-sha2-nistp521";
            break;
          case "ed25519":
            alg = { name: "Ed25519" };
            keyType = "ssh-ed25519";
            break;
          default:
            throw new Error(`Unsupported SSH key algorithm: ${algorithm}`);
        }

        const keys = await crypto.subtle.generateKey(alg, false, [
          "sign",
          "verify",
        ]) as CryptoKeyPair;

        // Create SSH public key
        const sshPublicKey = await ssh.SshPublicKey.fromWebCrypto(keys.publicKey, keyType as any);
        const publicKeyString = await sshPublicKey.toSSH();

        const obj: SshCaObject = {
          id: params.name,
          name,
          publicKey: publicKeyString,
          privateKey: keys.privateKey,
          keyType,
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
        const blob = new Blob([value.publicKey], {
          type: "text/plain",
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ssh_ca_${value.keyType}.pub`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    },
    enrollCertificate: async (publicKey: string, params: SshEnrollParams) => {
      if (!value) {
        throw new Error("SSH CA is not initialized");
      }

      try {
        // Parse public key
        const userSshPublicKey = await ssh.SshPublicKey.fromSSH(publicKey);

        // Create SSH certificate using SshCertificateBuilder
        const builder = ssh.SSH.createCertificate(userSshPublicKey);

        const randomBytes = new Uint8Array(8);
        crypto.getRandomValues(randomBytes);
        const serial = BigInt('0x' + Convert.ToHex(randomBytes));

        builder
          .setSerial(serial)
          .setType(params.certType)
          .setKeyId(params.keyId)
          .setValidPrincipals(params.principals)
          .setValidity(
            BigInt(Math.floor(params.validAfter.getTime() / 1000)),
            BigInt(Math.floor(params.validBefore.getTime() / 1000))
          )
          .setExtensions({
            "permit-X11-forwarding": "",
            "permit-agent-forwarding": "",
            "permit-port-forwarding": "",
            "permit-pty": "",
            "permit-user-rc": "",
          });

        // Get SSH CA public key
        const caPublicKey = await ssh.SshPublicKey.fromSSH(value.publicKey);

        // Sign the certificate
        const certificate = await builder.sign({
          signatureKey: caPublicKey,
          privateKey: value.privateKey,
        });

        return await certificate.toSSH();
      } catch (error) {
        throw new Error(`Failed to create SSH certificate: ${error}`);
      }
    },
  };

  return (
    <SshCaContext.Provider value={context}>
      {params.children}
    </SshCaContext.Provider>
  );
};

export const useSshCaContext = () => {
  const context = React.useContext(SshCaContext);
  if (context === undefined) {
    throw new Error("useSshCaContext must be used within a SshProvider");
  }
  return context;
};

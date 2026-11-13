# GoodKey Demo CA

This is a demo Certificate Authority (CA) interface for easy digital certificate
issuance and management. It supports both X.509 certificates and SSH certificates.
Built with React and TypeScript, using the [@peculiar/x509](https://github.com/PeculiarVentures/x509)
and [@peculiar/ssh](https://github.com/PeculiarVentures/ssh) libraries.

## Features

### X.509 CA

- Initialize a Certificate Authority with self-signed root certificate
- Import verified CSRs, SPKI public keys, or X.509 certificates in PEM or DER format
- Configure editable presets for Code Signing, S/MIME, PDF Signing, and CMS Encryption
- Edit subject DN, validity, typed SANs, key usage, and standard or custom EKU OIDs
- Save, manage, and exchange browser-local certificate templates
- Support for RSA and ECDSA key algorithms
- Certificate details viewing and validation
- Download certificates in PEM format

### SSH CA (New!)

- Initialize an SSH Certificate Authority
- Issue SSH certificates for users and hosts
- Support for RSA, ECDSA, and Ed25519 key algorithms
- Configure certificate principals, validity periods, and extensions
- SSH certificate details viewing
- Download SSH certificates

The application stores CA private keys and certificates in the browser's IndexedDB.
Certificate templates use localStorage. Certificate issuance happens locally in the browser.

## Issuing an X.509 certificate

1. Initialize a demo CA, then paste a PEM input or upload a PEM/DER file (up to 1 MiB).
   CSR signatures are verified before continuing. Verification proves possession of the
   signing key; it does not verify the requested identity. Importing a certificate copies
   only its public key.
2. Configure the certificate using a built-in preset, a local template, or custom settings.
   CSR subject, SAN, and usage requests are shown separately and require explicit application.
   Unsupported requested extensions are reported and are not copied.
3. Use Basic for common subject, duration, and SAN fields, or Advanced for other subject
   fields, usage flags, critical extensions, and custom numeric EKU OIDs. Switching modes
   and going back preserves settings. The full DN editor preserves unknown attributes,
   repeated attributes, and multi-valued names that the structured editor cannot represent.
   Exact dates use the browser's local time zone; review also displays UTC.
4. Review the effective settings and resolve validation errors before issuing. The result
   displays the actual certificate dates and extensions, with PEM copy and download actions.
   Issue another retains the configuration and requires a new key import.

This workflow issues end-entity certificates only. Issuer, serial number, basic constraints,
SKI, and AKI are generated automatically. Validity must fit within the issuer's validity;
key usages must suit the imported key. Arbitrary DER extension editing is not supported.

## Local certificate templates

Use **Save as template** or **Save a copy** to create a named template. Subject and SAN
are excluded by default; explicitly opt in to store either identity field. Keys, CSRs,
certificate inputs, issuer details, and generated fields are never stored in templates.
Templates store a relative duration starting at issuance. Saving an exact date range
requires explicit conversion to the displayed duration.

The picker indicates modified settings. Built-in presets are immutable; local templates
support explicit Save changes, Save a copy, rename, duplicate, and delete. Applying a
different configuration previews the fields it will replace. Reapply template restores
the selected template after editing. Identity fields omitted by a template are preserved.

**Manage templates** supports validated version-1 JSON import by paste or file, JSON copy,
and download of all or selected templates. ID collisions stop the import by default;
choose replacement or a new copy explicitly. Imports are atomic. Invalid data, unsupported
versions, and browser storage failures are shown as errors without replacing saved data.
Templates persist only in the current browser and origin; export them for backup or transfer.
Other tabs synchronize template-list changes through browser storage events.

## Live Demo

You can check out the live demo of the application at
[https://peculiarventures.github.io/goodkey-demo-ca](https://peculiarventures.github.io/goodkey-demo-ca).

## Development

Use Node.js 24.15 or newer in the Node 24 LTS line (`nvm use` reads `.nvmrc`).
Install the exact dependency versions from the committed lockfile:

```sh
# Install dependencies
npm ci

# Start the development server
npm start
```

Open [http://127.0.0.1:8000/goodkey-demo-ca/](http://127.0.0.1:8000/goodkey-demo-ca/).
Vite 8 uses Oxc for TypeScript and JSX transformation and Rolldown for production
bundling. React Fast Refresh is enabled by the official Vite React plugin.

```sh
npm run typecheck     # TypeScript checks without emitting files
npm run lint          # Oxlint; warnings fail the check
npm run format:check  # Oxfmt formatting check
npm run format        # Apply Oxfmt formatting
npm test              # Run Vitest once
npm run test:watch    # Watch tests during development
npm run build         # Build the GitHub Pages site in dist/
npm run preview       # Serve the production build on port 8000
npm run check         # Run all checks and the production build
```

Vitest uses jsdom, Node's WebCrypto implementation, and an isolated fake IndexedDB
database per test. These checks exercise the existing CA providers and stored
keys; browser-specific behavior still needs verification in a supported browser.

The production base path is `/goodkey-demo-ca/`. GitHub Actions runs all checks on
pull requests and pushes to `main`, and deploys successful `main` builds to the
`gh-pages` branch.

## Security Notice

This application is intended for demonstration and testing purposes only. The generated
certificates are not trusted by browsers or operating systems by default. For production
use, you should:

- Use proper hardware security modules (HSMs) or secure key storage
- Implement proper certificate validation and revocation mechanisms
- Follow industry best practices for certificate authority operations

# GoodKey Demo CA

This is a demo Certificate Authority (CA) interface for easy digital certificate
issuance and management. It supports both X.509 certificates and SSH certificates.
Built with React and TypeScript, using the [@peculiar/x509](https://github.com/PeculiarVentures/x509)
and [@peculiar/ssh](https://github.com/PeculiarVentures/ssh) libraries.

## Features

### X.509 CA

- Initialize a Certificate Authority with self-signed root certificate
- Issue X.509 certificates based on Certificate Signing Requests (CSRs)
- Support for multiple certificate profiles (Code Signing, S/MIME, PDF Signing, etc.)
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

The application stores all private keys and certificates securely in the browser's IndexedDB,
ensuring they never leave your local environment.

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

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

To run the application locally, you can use the following commands:

```sh
# Install dependencies
npm install

# Start the development server
npm start
```

## Security Notice

This application is intended for demonstration and testing purposes only. The generated
certificates are not trusted by browsers or operating systems by default. For production
use, you should:

- Use proper hardware security modules (HSMs) or secure key storage
- Implement proper certificate validation and revocation mechanisms
- Follow industry best practices for certificate authority operations

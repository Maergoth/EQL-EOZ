# Windows signing

Eye of Zomm's Windows workflows are ready to Authenticode-sign the application and NSIS installer when a trusted code-signing certificate is available.

## Certificate-backed GitHub build

Add these encrypted Actions secrets to the repository:

- `WINDOWS_CERTIFICATE_PFX_BASE64`: the base64-encoded PFX certificate file.
- `WINDOWS_CERTIFICATE_PASSWORD`: the PFX password.

Both `build-windows.yml` and `release.yml` require these secrets, pass the certificate to electron-builder, and verify the packaged app executable and NSIS installer. If either secret is absent or either signature is invalid, no official artifact is uploaded and no release is published.

Local developer builds may still be unsigned, but the repository's public Windows artifact paths are intentionally hard-gated.

Never commit a certificate or password to the repository.

## Obtaining a trusted certificate

For this open-source project, the preferred path is an application to SignPath Foundation's free open-source signing program. A conventional organization-validation certificate or Microsoft Store distribution are alternatives.

A self-signed certificate does not establish public trust and will not remove SmartScreen warnings. A newly issued trusted certificate also does not guarantee that every reputation-based SmartScreen prompt disappears immediately; Microsoft combines the publisher identity with download reputation.

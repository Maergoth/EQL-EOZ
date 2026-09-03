# Windows signing

Eye of Zomm's Windows workflows are ready to Authenticode-sign the application and NSIS installer when a trusted code-signing certificate is available.

## Certificate-backed GitHub build

Add these encrypted Actions secrets to the repository:

- `WINDOWS_CERTIFICATE_PFX_BASE64`: the base64-encoded PFX certificate file.
- `WINDOWS_CERTIFICATE_PASSWORD`: the PFX password.

When both secrets are present, `build-windows.yml` and `release.yml` pass the certificate to electron-builder and verify the packaged app executable and NSIS installer. A partial signing configuration fails immediately. If neither secret is present, the workflows publish an unsigned build with a prominent workflow warning.

Unsigned builds can trigger an Unknown publisher or SmartScreen warning. Signing can be enabled later without changing the application build.

Never commit a certificate or password to the repository.

## Obtaining a trusted certificate

For this open-source project, the preferred path is an application to SignPath Foundation's free open-source signing program. A conventional organization-validation certificate or Microsoft Store distribution are alternatives.

A self-signed certificate does not establish public trust and will not remove SmartScreen warnings. A newly issued trusted certificate also does not guarantee that every reputation-based SmartScreen prompt disappears immediately; Microsoft combines the publisher identity with download reputation.

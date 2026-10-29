# Dependency license review

Runtime dependency inventory generated from the exact lockfile. These permissive licenses permit use with the MIT original code, with upstream notices retained. No OpenRGB binaries, drivers or manufacturer SDKs are redistributed. Windows portable builds bundle an unmodified official Node.js executable and retain its full MIT and third-party license text in runtime/LICENSE.txt; the version, download URL and SHA-256 are pinned in distribution-runtime.json. The independent TCP adapter communicates with separately installed OpenRGB; it contains no copied OpenRGB implementation. Development-only Lightning CSS packages use MPL-2.0 and are neither modified nor included in the preview archive. Re-run this review when dependencies change. This inventory is an engineering review, not a legal opinion.

| Package                     | Version | License        |
| --------------------------- | ------- | -------------- |
| @homebridge/ciao            | 1.3.12  | MIT            |
| @homebridge/dbus-native     | 0.7.9   | MIT            |
| @homebridge/hap-nodejs      | 2.2.3   | Apache-2.0     |
| @leichtgewicht/ip-codec     | 2.0.5   | MIT            |
| ansi-regex                  | 5.0.1   | MIT            |
| ansi-styles                 | 4.3.0   | MIT            |
| bonjour-hap                 | 3.10.5  | MIT            |
| buffer-from                 | 1.1.2   | MIT            |
| camelcase                   | 5.3.1   | MIT            |
| cliui                       | 6.0.0   | ISC            |
| color-convert               | 2.0.1   | MIT            |
| color-name                  | 1.1.4   | MIT            |
| debug                       | 4.4.3   | MIT            |
| decamelize                  | 1.2.0   | MIT            |
| dijkstrajs                  | 1.0.3   | MIT            |
| dns-packet                  | 5.6.1   | MIT            |
| duplexer                    | 0.1.2   | MIT            |
| emoji-regex                 | 8.0.0   | MIT            |
| event-stream                | 4.0.1   | MIT            |
| fast-deep-equal             | 3.1.3   | MIT            |
| fast-srp-hap                | 2.0.4   | MIT            |
| from                        | 0.1.7   | MIT            |
| futoin-hkdf                 | 1.5.3   | Apache-2.0     |
| get-caller-file             | 2.0.5   | ISC            |
| graceful-fs                 | 4.2.11  | ISC            |
| hexy                        | 0.4.0   | MIT            |
| is-fullwidth-code-point     | 3.0.0   | MIT            |
| long                        | 5.3.2   | Apache-2.0     |
| map-stream                  | 0.0.7   | MIT            |
| minimist                    | 1.2.8   | MIT            |
| ms                          | 2.1.3   | MIT            |
| multicast-dns               | 7.2.5   | MIT            |
| multicast-dns-service-types | 1.1.0   | MIT            |
| p-try                       | 2.2.0   | MIT            |
| path-exists                 | 4.0.0   | MIT            |
| pause-stream                | 0.0.11  | MIT OR Apache2 |
| pngjs                       | 5.0.0   | MIT            |
| proper-lockfile             | 4.1.2   | MIT            |
| qrcode                      | 1.5.4   | MIT            |
| qrcode-terminal             | 0.12.0  | Apache 2.0     |
| require-directory           | 2.1.1   | MIT            |
| require-main-filename       | 2.0.0   | ISC            |
| retry                       | 0.12.0  | MIT            |
| safe-buffer                 | 5.2.1   | MIT            |
| sax                         | 1.6.1   | BlueOak-1.0.0  |
| set-blocking                | 2.0.0   | ISC            |
| signal-exit                 | 3.0.7   | ISC            |
| source-map                  | 0.6.1   | BSD-3-Clause   |
| source-map-support          | 0.5.21  | MIT            |
| split                       | 1.0.1   | MIT            |
| stream-combiner             | 0.2.2   | MIT            |
| string-width                | 4.2.3   | MIT            |
| strip-ansi                  | 6.0.1   | MIT            |
| through                     | 2.3.8   | MIT            |
| thunky                      | 1.1.0   | MIT            |
| tslib                       | 2.8.1   | 0BSD           |
| tweetnacl                   | 1.0.3   | Unlicense      |
| which-module                | 2.0.1   | ISC            |
| wrap-ansi                   | 6.2.0   | MIT            |
| xml2js                      | 0.6.2   | MIT            |
| xmlbuilder                  | 11.0.1  | MIT            |
| y18n                        | 4.0.3   | ISC            |
| yargs                       | 15.4.1  | MIT            |
| yargs-parser                | 18.1.3  | ISC            |
| find-up                     | 4.1.0   | MIT            |
| locate-path                 | 5.0.0   | MIT            |
| p-limit                     | 2.3.0   | MIT            |
| p-locate                    | 4.1.0   | MIT            |
| zod                         | 4.6.7   | MIT            |

Full runtime notices: [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

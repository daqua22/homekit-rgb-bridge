# Manual verification checklist

Status at initial implementation: **all physical Apple Home / Windows / RGB checks below are pending**. Automated tests do not check these boxes. Use only a trusted private network and supported hardware. Record commit, date, OS/build, Node/OpenRGB versions, iOS version, manufacturer/model/firmware and redacted results.

| Check                         | Procedure                                                           | Expected / evidence needed                                                       | Initial status |
| ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| Mock Apple Home pairing       | Start `init --mock`, then `start --pairing`; add through Apple Home | One virtual light appears; setup works without OpenRGB                           | Pending        |
| Mock controls                 | Use Home on/off, red/green/blue/white and 0/25/50/100% brightness   | Desired state changes, fixed debug command events; no hardware claim             | Pending        |
| Pairing persistence           | Stop with Ctrl+C, restart without `--pairing`                       | Home retains bridge/rooms and responds without pairing again                     | Pending        |
| Hardware discovery            | Stop bridge, run `list` with local OpenRGB server                   | Correct device metadata/zones/capabilities; unsupported devices refused          | Pending        |
| Hardware on/off               | Enable exact ID; start, turn on then off then on                    | Black then restored desired color; no electrical power claim                     | Pending        |
| Color / brightness            | Set RGB primaries, white/grayscale and brightness levels            | Each eligible device visibly follows commands; note nonlinearities               | Pending        |
| Application restart           | Restart bridge with same private data                               | Same identity, pairing and desired color/brightness/off                          | Pending        |
| Windows restart               | Configure task, reboot and sign in                                  | OpenRGB SDK and bridge recover, Home control returns; record stale-lock behavior | Pending        |
| OpenRGB crash                 | Stop/kill only OpenRGB while bridge runs                            | Home reports unavailable; bounded retry events; no false success                 | Pending        |
| OpenRGB recovery              | Restart server with same hardware                                   | Inventory refresh and saved desired output restored                              | Pending        |
| Device disappear/reappear     | Safely disconnect/reconnect a hotpluggable supported device         | Unavailable while absent; correct identity/output returns                        | Pending        |
| Multiple devices              | Change one light; reorder safely, reconnect server                  | Only intended controller changes; identities do not follow numeric indices       | Pending        |
| Unsupported/duplicate devices | Inspect unsupported or indistinguishable controllers                | Explicit capability reason and rejected writes; no guessed support               | Pending        |
| Conflicting apps              | Baseline with manufacturer RGB tools stopped                        | Record enabled apps; do not assume simultaneous access is supported              | Pending        |
| Startup/shutdown              | Ctrl+C and configured scheduled task                                | No duplicate process, lock released on graceful stop, no unhandled errors        | Pending        |
| Private output/storage        | Inspect default output and folder ACL privately                     | No setup values in default logs; unauthorized local users lack access            | Pending        |

Never attach setup credentials, QR codes, raw serials, private paths or HAP files. Verified screenshots should show only post-pairing controls/results, have sensitive data removed and identify the actual tested environment. Record failures as failures; do not mark a partial pass as full hardware support.

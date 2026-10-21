# Platform 0.44 migration — October 21, 2026

Target: 1.2.24. Platform commit: `57cc033e248f92835c4c5ee29c823cadbb5050a2`.
Exact changed package versions: Node Core 0.1.0, Admin Shell 0.14.0,
Site Shell 0.4.0 and Test Core 0.4.0 where consumed. The automated consumer
contract records the complete package map; native dependency lockfiles stay pinned.

## Scope

Stripe SDK loading, async campaign media target identity, paired draft baseline recovery and Node bootstrap. New source-only/maintenance deployment guards suppress diary broadcasts.

Product models, routes, storage, provider credentials, SDK URLs, content and
publication authority stay in this repository. No checkout or subscriber
operation is required to validate this migration.

## Evidence

67 focused cases passed, including all 28 draft-recovery cases. The full unit run passed 1155 cases and had one Jekyll timeout; that isolated case then passed. Hosted premerge/browser and final source checks remain required.

Independent pre-migration source rollback was rehearsed at consumer
`c7301d573d60183ee86ff7504bfe4cb687733f05`, retaining its original Platform pin `86709d34822649a5679bf2da65d25a5937b3d215`.
Source rollback means reverting the complete migration (adapters, bundle entries,
package contracts and gitlink together), never changing the gitlink alone.
An app rollback must install the preceding verified signed release; deployed
services retain their own previous artifact and deployment rollback procedure.
A source rehearsal is not a claim that production was rolled back.

CI and publication evidence belongs to this consumer pull request and final
release record. Do not equate a local build or a green source check with a
published app or production deployment.

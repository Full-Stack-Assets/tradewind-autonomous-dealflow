# Massachusetts and Rhode Island Data Sources

## Massachusetts

The implemented adapter maps official-source-shaped **MassGIS Level 3** parcel features and preserves the FeatureServer/item URL, source record identifier, retrieval time, raw attributes, and geometry. The current MassGIS FeatureServer item is `73d4c766167848b795f1048cad3919c7`; Mass.gov identified its REST URL as new on April 2, 2026, and the service contract was re-verified on August 11, 2026. The adapter maps only fields actually present in the response. Mortgage balance, vacancy, distress, zoning, ownership identity, or contact details remain **unknown** when the source does not supply them.

## Rhode Island

Rhode Island parcel availability is municipality-dependent. The implemented directory parser creates a provider-neutral registry from Rhode Island municipal land-record links, and the ArcGIS boundary can process a municipality when its service contract is known. A statewide uniform enrichment claim is not made.

## Promotion rule

Raw snapshots remain immutable. A staged observation is promoted to a workflow source record only when the required property fields have explicit source evidence. Missing fields are not inferred merely to advance the workflow.

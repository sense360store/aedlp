import { Callout, CopyButton } from "../ui";
import { OutField } from "./OutField";

export function ApiParameterPayloadOutput({ effectiveRegex }: { effectiveRegex: string }) {
  const payload = { value: [effectiveRegex] };
  const pretty = JSON.stringify(payload, null, 2);
  const serialized = JSON.stringify(JSON.stringify(payload)); // escaped, JSON-safe string
  const curl =
`curl -X PUT \\
  "https://{subdomain}.tessian-platform.com/filters/parameters/v1/{parameter_id}" \\
  -H "Authorization: API-Token $TESSIAN_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload)}'`;

  return (
    <div>
      <Callout tone="danger" title="This does not create a policy" icon="alert">
        The API payload updates a <b>parameter value used by an existing Custom Policy condition</b>, where a valid
        <code> parameter_id</code> already exists. It does not create a new AEDLP Custom Policy.
      </Callout>
      <div style={{ height: 12 }} />
      <OutField name="JSON payload" value={pretty} />
      <OutField name="Serialized (escaped) payload" value={serialized} />
      <div className="out-field">
        <div className="out-label">
          <span className="ol-name">curl template — placeholders only</span>
          <CopyButton value={() => curl} />
        </div>
        <div className="out-value">{curl}</div>
      </div>
      <Callout tone="warn" title="Never expose tokens in the browser" icon="lock">
        Do not enter real API tokens in this prototype. Any real integration must run through a secure backend service —
        not frontend code.
      </Callout>
      <div className="code dark-code" style={{ marginTop: 12 }}>
        {`# Future backend integration points\nGET  /parameters/:id\nPUT  /parameters/:id   → { "value": [ "<regex-or-keyword>" ] }`}
      </div>
    </div>
  );
}

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep remote agent tools in src/lib/mcp, with one defineTool per file and SDK-generated transport routes; OAuth caller-scoped clients preserve existing RLS.
- Register browser agent tools in the component owning the visible data and wrap execution with the shared WebMCP telemetry helper; this preserves screen scope and excludes user content from telemetry.
- Canonicalize auth next paths once with oauthReturnPath before navigation; this preserves consent without permitting external redirects.

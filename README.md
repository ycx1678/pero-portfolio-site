# PERO Live2D Portfolio

Public files for the PERO Live2D portfolio and its local-only administrator prototype, published with GitHub Pages.

The administrator page is available at `/admin/`. Enter the administrator password there to publish its work list, ordering, visibility, copy, and colors to the shared Cloudflare database. Visitors then receive the same current portfolio state.

## Artmug iframe

Use the deployed address with `?embed=artmug` as the iframe source:

```html
<iframe
  src="https://ycx1678.github.io/pero-portfolio-site/?embed=artmug"
  title="PERO Live2D 포트폴리오"
  width="1180"
  height="10200"
  loading="lazy"
  style="display:block; width:100%; max-width:1180px; border:0;"
></iframe>
```

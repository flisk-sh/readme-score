# slugkit

Turn any title into a URL slug.

```bash
npm install slugkit
```

```js
import { slug } from "slugkit";

slug("Hello, World!"); // "hello-world"
```

## API

### slug(text, options)

Returns the slug. `options.separator` sets the character between words.

## Examples

- `slug("Crème brûlée")` gives `creme-brulee`.

## License

MIT

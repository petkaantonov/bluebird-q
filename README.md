###Introduction

This is a drop-in replacement for [Q version 1.x](http://npmjs.org/package/q) that delegates to [bluebird 2.8](http://npmjs.org/package/bluebird). Enjoy better stack traces, performance and memory usage without changing your existing legacy code.

Depends on bluebird 2.8.

Installation:

```
npm install bluebird-q
```

Usage:

```js
var Q = require("bluebird-q");
```


###Testing

Clone this repository and then run `npm install && npm test` in the cloned directory root.

###Caveats

 - `dispatch` and `Q.makePromise` are unimplemented
 - Currently relies on `Object.defineProperty` so cannot be used in browsers that don't support ES5
 - Performance of Q-specific methods is not yet optimized e.g.
    - `nfapply`
    - `nfcall`
    - `nfbind`
    - `npost`
    - `nsend`
    - `ninvoke`
    - `nbind`
    - `nmcall`
    - `fapply`
    - `fcall`
    - `fbind`
    - `denodeify`
    - `nmapply`
    - `mapply`
    - `post`
    - `send`
    - `mcall`
    - `invoke`
    - ....
 - However bluebird-specific methods that don't collide with Q names are still available e.g. `Q.promisifyAll`
 - A few original tests had to be modified in spec/q-spec.js, you can find these tests by searching for "Test modified"

/*!The MIT License (MIT)
 *
 * Copyright (c) 2014 Petka Antonov
 *
 * With parts by 2009-2014 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:</p>
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
var Promise = require("bluebird/js/main/promise")();
var scheduler = require("bluebird/js/main/schedule");
var THIS = {};
var INSTANCE = {};

var aliasMap = {
    thenReturn: "thenResolve",
    thenThrow: "thenReject",
    caught: "fail",
    progressed: "progress",
    lastly: "fin",
    call: "send mcall invoke".split(" ")
};

var staticAliasMap = {
    reject: "reject rejected".split(" "),
    resolve: "resolve resolved fulfill fulfilled".split(" "),
    is: "isPromise",
    race: "race",
    async: "coroutine",
    spawn: "spawn",
    delay: "delay",

    timeout: INSTANCE,
    join: INSTANCE,
    spread: INSTANCE,
    tap: INSTANCE,
    thenReject: INSTANCE,
    thenResolve: INSTANCE,
    isPending: INSTANCE,
    isFulfilled: INSTANCE,
    isRejected: INSTANCE,
    get: INSTANCE,
    set: INSTANCE,
    del: INSTANCE,
    'delete': INSTANCE,
    'try': INSTANCE,
    keys: INSTANCE,
    allResolved: INSTANCE,
    allSettled: INSTANCE,
    fail: INSTANCE,
    "catch": INSTANCE,
    progress: INSTANCE,
    fin: INSTANCE,
    "finally": INSTANCE,
    done: INSTANCE,
    timeout: INSTANCE,
    nodeify: INSTANCE,
    nfapply: INSTANCE,
    nfcall: INSTANCE,
    nfbind: INSTANCE,
    npost: INSTANCE,
    nsend: INSTANCE,
    ninvoke: INSTANCE,
    nbind: INSTANCE,
    nmcall: INSTANCE,
    fapply: INSTANCE,
    fcall: INSTANCE,
    fbind: INSTANCE,
    denodeify: INSTANCE,
    nmapply: INSTANCE,
    mapply: INSTANCE,
    post: INSTANCE,
    send: INSTANCE,
    mcall: INSTANCE,
    invoke: INSTANCE
};

function Q(value) {
    return Promise.resolve(value);
}

Q.all = Promise.all;

Q.Promise = function(resolver) {
    var ret = Q.defer();
    try {
        resolver(ret.resolve, ret.reject, ret.notify);
    } catch (e) {
        ret.reject(e);
    }
    return ret.promise;
};
Q.promise = Q.Promise;
Q.isPromiseAlike = function(value) {
    if (value instanceof Promise) return true;
    // If it was a thenable it will always pending
    // If it was a value it will always be fulfilled synchronously
    return Promise.resolve(value).isPending();
};
var map = Promise.map;
var resolve = Promise.resolve;
Q.promised = function(func) {
    return function() {
        var args = [].slice.call(arguments);
        args.unshift(this);
        return map(args, resolve).then(function(args) {
            return func.apply(args.shift(), args);
        });
    };
};

Q.when = function(a, b, c, d) {
    return Q(a).then(b, c, d);
};

Q.nearer = function(value) {
    if (value instanceof Promise) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
};
Q.passByCopy = function(arg) {return arg;};

Q.defer = function() {
    var ret = {};
    var promise = new Promise(function(resolve, reject) {
        ret.resolve = ret.fulfill = resolve;
        ret.reject = reject;
    });
    ret.promise = promise;
    ret.notify = bind(promise._progress, promise);
    ret.makeNodeResolver = function() {
        return function(err, result) {
            if (err) return ret.reject(err);
            if (arguments.length > 2) return ret.resolve([].slice.call(arguments, 1));
            return ret.resolve(result);
        };
    };
    return ret;
};
Q.deferred = Q.pending = Q.defer;


var settle = Promise.settle;
var map = Promise.map;
Promise.prototype.allSettled = function() {
    return map(settle(this), bluebirdInspectionToQInspection);
};

Promise.prototype.allResolved = function() {
    return map(settle(this), function(i) {
        if (i.isFulfilled()) return Q(i.value());
        if (i.isRejected()) return Q.reject(i.reason());
    });
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

Promise.prototype.fbind = function() {
    var args = [].slice.call(arguments);
    var promise = this;
    return function() {
        args = args.concat([].slice.call(arguments));
        var self = this;
        return promise.then(function(fn) {
            return fn.apply(self, args);
        });
    };
};

Promise.prototype.fapply = function(args) {
    return this.then(function(f) {
        return f.apply(undefined, args);
    });
};

Promise.prototype["try"] = Promise.prototype.fcall = function() {
    return this.fapply.call(this, [].slice.call(arguments));
};

Promise.prototype.nfapply = function(args) {
    return this.then(function(nodeFn) {
        return doNode(nodeFn, undefined, args);
    });
};

Promise.prototype.nfcall = function() {
    return this.nfapply.call(this, [].slice.call(arguments));
};

Promise.prototype.nfbind = Promise.prototype.denodeify = function() {
    var nodeFn = this;
    var args = [].slice.call(arguments);
    return function() {
        var self = this;
        args = args.concat([].slice.call(arguments));
        return nodeFn.then(function(nodeFn) {
            return doNode(nodeFn, self, args);
        });
    };
};

Promise.prototype.nbind = function(ctx) {
    var nodeFn = this;
    var args = [].slice.call(arguments, 1);
    return function() {
        args = args.concat([].slice.call(arguments));
        return nodeFn.then(function(nodeFn) {
            return doNode(nodeFn, ctx, args);
        });
    };
};

Promise.prototype.npost = Promise.prototype.nmapply = function(name, args) {
    return this.then(function(object) {
        return doNode(object[name], object, args);
    });
};

Promise.prototype.ninvoke = Promise.prototype.nsend =
Promise.prototype.nmcall = function(name) {
    var args = [].slice.call(arguments, 1);
    return this.then(function(object) {
        return doNode(object[name], object, args);
    });
};

Promise.prototype.mapply = Promise.prototype.post = function(methodName, args) {
    if (!methodName) return this.fapply(args);
    args.unshift(methodName);
    return this.invoke.apply(this, args);
};

var nodeify = Promise.prototype.nodeify;
Promise.prototype.nodeify = function(callback) {
    if (typeof callback === "function") {
        nodeify.call(this, callback);
        return;
    }
    return this;
};

Promise.prototype.inspect = function() {
    if (this.isPending()) return {state: "pending"};
    else if(this.isFulfilled()) return {state: "fulfilled", value: this.value()}
    else return {state: "rejected", reason: this.reason()}
};

Promise.prototype.passByCopy = function() {
    return this;
};

Promise.prototype.set = function(key, val) {
    return this.then(function(object) {
        object[key] = val;
    });
};

Promise.prototype["delete"] = Promise.prototype.del = function(key) {
    return this.then(function(object) {
        delete object[key];
    });
};

Promise.prototype.keys = function() {
    return this.then(function(o) {
        return Object.keys(o);
    });
};

Promise.prototype.race = function () {
    return this.then(Q.race);
};

var caught = Promise.prototype.caught;
var timeout = Promise.prototype.timeout;
Promise.prototype.timeout = function(time, customErr) {
    var result = timeout.apply(this, arguments);
    return caught.call(result, Promise.TimeoutError, function(e) {
        e.code = "ETIMEDOUT";
        if (customErr instanceof Error) {
            throw customErr;
        }
        throw e;
    });
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        var onerror = Q.onerror;
        scheduler(function () {
            promise._attachExtraTrace(error);
            if (onerror) {
                onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};


var defaultScheduler = scheduler;
Object.defineProperty(Q, "nextTick", {
    get: function() {
        return scheduler;
    },

    set: function(val) {
        if (typeof val === "function") {
            scheduler = val;
            Promise.setScheduler(val);
        } else {
            scheduler = defaultScheduler;
            Promise.setScheduler(defaultScheduler);
        }
    }
});

Object.defineProperty(Q, "longStackSupport", {
    set: function(val) {
        if (val) {
            Promise.longStackTraces();
        }
    },
    get: function() {
        return Promise.haveLongStackTraces();
    }
});

var unhandledReasons = [];
var unhandledRejections = [];
var unhandledReasonsDisplayed = false;
var trackUnhandledRejections = true;
function displayUnhandledReasons() {
    if (
        !unhandledReasonsDisplayed &&
        typeof window !== "undefined" &&
        window.console
    ) {
        console.warn("[bluebird-Q] Unhandled rejection reasons (should be empty):",
                     unhandledReasons);
    }

    unhandledReasonsDisplayed = true;
}

function logUnhandledReasons() {
    for (var i = 0; i < unhandledReasons.length; i++) {
        var reason = unhandledReasons[i];
        console.warn("Unhandled rejection reason:", reason);
    }
}

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;
    unhandledReasonsDisplayed = false;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;

        // Show unhandled rejection reasons if Node exits without handling an
        // outstanding rejection.  (Note that Browserify presently produces a
        // `process` global without the `EventEmitter` `on` method.)
        if (typeof process !== "undefined" && process.on) {
            process.on("exit", logUnhandledReasons);
        }
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
    displayUnhandledReasons();
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = unhandledRejections.indexOf(promise);
    if (at !== -1) {
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    if (typeof process !== "undefined" && process.on) {
        process.removeListener("exit", logUnhandledReasons);
    }
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

Promise.onPossiblyUnhandledRejection(function(reason, promise) {
    trackRejection(promise, reason);
});
Promise.onUnhandledRejectionHandled(untrackRejection);

Object.keys(aliasMap).forEach(function(key) {
    var Qmethods = aliasMap[key];
    if (!Array.isArray(Qmethods)) Qmethods = [Qmethods];
    Qmethods.forEach(function(Qmethod) {
        Promise.prototype[Qmethod] = Promise.prototype[key];
    });
});

Object.keys(staticAliasMap).forEach(function(key) {
    var Qmethods = staticAliasMap[key];
    if (Qmethods === INSTANCE) {
        if (typeof Promise.prototype[key] !== "function")
            throw new Error("unimplemented Promise.prototype." + key);
        Q[key] = function(promise) {
            var instance = Q(promise);
            return instance[key].apply(instance, [].slice.call(arguments, 1));
        };
    } else {
        if (!Array.isArray(Qmethods)) Qmethods = [Qmethods];
        Qmethods.forEach(function(Qmethod) {
            Q[Qmethod] = Promise[key];
        });
    }
});

if (typeof process === "object" && process && process.env && process.env.Q_DEBUG) {
    Q.longStackSupport = true;
}

function f() {};
f.prototype = Q;
f.prototype = Promise.prototype;

function doNode(fn, ctx, args) {
    ctx = ctx === THIS ? this : ctx;
    var d = Q.defer();
    args.push(d.makeNodeResolver());
    try {
        fn.apply(ctx, args);
    } catch (e) {
        d.reject(e);
    }
    return d.promise;
}

function bind(fn, ctx) {
    return function() {
        return fn.apply(ctx, arguments);
    };
}

function bluebirdInspectionToQInspection(i) {
    if (i.isFulfilled()) {
        return {state: "fulfilled", value: i.value()};
    } else if (i.isRejected()) {
        return {state: "rejected", reason: i.reason()};
    } else {
        return {state: "pending"};
    }
}

module.exports = Q;

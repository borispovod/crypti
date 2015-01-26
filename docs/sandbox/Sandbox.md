# Sandbox

Sandbox is standalone js vm component with extensible architecture. It has plugins to control over process, transport,
api, etc.

## Initialization and execution

Plugin initialization algorithm:

0. List plugins from `options.plugins` and run its' factories.
1. Create execution order based on `require` property of plugin instance.
2. Create session and run execution of transaction script.
3. Create async call stack.
4. Run plugins `onStart` event handler.
5. If all plugins started successful, then run `onBeforeExec` event.
6. Start script execution.
7. Run `onAfterExec` callbacks.
8. Run `onStop` (or `onError`) callbacks.
9. Return execution result with result callback.

## Methods

### run(process(done, session), callback(err)) -> Sandbox

Run vm, do some job with `process` and shutdown the machine. Example:

```javascript
sandbox.run(function(done){ // VM is running...
        sandbox.process.exec('require', ['script.js'}], function(err){
            if (err) return done(err);

            console.log('Script required!');
            return done();
        });
    }, function(err){ // VM is shout down
        if (err) {
            // Process error
        } else {
            // Do something on success
        }
    });
```

### exec(method, [args,] callback(err [,arg1, arg2, ...])) -> Sandbox

Run method inside vm and return it's result via callback. Example:

```javascript

sandbox.exec('echo', ['Hello world'], function(err, result) {
    console.log(result); // -> Hello world
});

```

### eval(script, callback(err [,arg1, arg2, ...]) ->Sandbox

Execute code inside VM and return result via callback. Script could be string or object with properties `source` and `filename`. Example:

```javascript
sandbox.eval('done(null, "Hello world")', function(err, hello){
    console.log(hello); // -> Hello world
});

sandbox.eval({
    filename : 'http://crypti.org/scripts/hello+world.js',
    source:'done(null, "Hello", "world")'
}, function(err, arg1, arg2) {
    console.log(arg1 + " " + arg2); // -> Hello world
});

sandbox.eval({
    filename : 'http://crypti.org/scripts/hello+world.js',
    source : 'done(null, "Hello world")'
}, function(err, result) {
    console.log(result); // -> Hello world
});
```

## Plugins

Each plugin has two separated parts one is running inside host process and other in sandbox process. They could to
communicate with each other via sandbox transport system (`ipc` by default).

### Properties

* `session` – current vm session `EventEmitter`.
* `sandbox` – current sandbox object `Sandbox`.
* `require` – plugin dependencies `String|Array`.

### Events

Each plugin has named event methods. Some of them are optionally async:

* _onStart_
* _onBeforeExec_
* _onAfterExec_
* onStop
* onError

To make event handler asynchronous add `done` as the first argument to function definition. Example:

```javascript
// Async event
{
    onStart : function(done) {
        // Finish when `done` called.
        setTimeout(done, 10);
    }
}

// Sync event
{
    onStart : function() {
        // Finish after call ends
    }
}

```


There is several plugins: `process`, `tcp`, `api` and `timer`. Core plugins are `process`

### Default methods

Sandbox has plugin prototype used as plugins' `__proto__`. It contains methods to simplify plugin interconnection and
control over plugin lifetime.

#### setTimeout(cb, timeout) -> func

Set timeout and remember it's id in plugins memory. It returns function to clear itself.

#### clearTimeouts()

Remove all timeouts.

#### setInterval(cb, interval) -> func

Set interval and remember it's id in plugins memory. It returns function to clear itself.

#### clearIntervals()

Remove all intervals.

#### clearTimers()

Remove all timers from plugin memory


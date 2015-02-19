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

There is core plugins: `process`, `tcp`, `api`, `transaction`.

### Plugin factory

Plugin factory is a function which returns plugin instance. It has two arguments `sandbox` and `options`. Example:

```javascript
module.exports = function(sandbox, options) {
    return {
        onStart : function(){
            //...
        }
    }
};
```

### Reserved properties

| Key       | Type                   | Description         |
|-----------|------------------------|---------------------|
| `session` | `EventEmitter`         | Current vm session  |
| `require` | `String|Array`         | Plugin dependencies |
| `events`  | `Object<event,method>` | Events bindings map |

### Events

Each plugin has named event methods. Some of them are optionally async (marked italic):

| Event         | Note  |
|---------------|-------|
| onStart       | async |
| onBeforeExec  | async |
| onAfterExec   | async |
| onStop        |       |
| onError       |       |

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

Remove all timers from plugin memory.

## Sandbox messages

Sandbox messages are JSON convertible objects. Each message has `type` property to specify message type. Each plugin could
specify it's own exchange format. But it strongly recommended to use messages as objects and do not use `type` in other purposes
then described.

## Sandbox transport

Transport plugins should to realize `send` and `exec` methods for sandbox communication and provide transport functionality.


## Built-in plugins

### Process plugin

This plugin spawn new node process and initialize communication channel via default node IPC.

Note that default IPC channel is blocking and should not be used for big data transaction. It's limited to 64 Kb. Use TCP
transport plugin to send big amounts of data.

#### Options

| Name        | Type         | Default value | Description |
|:------------|:-------------|:--------------|:------------|
|`cwd`        | string       | process.cwd   | Child process directory    |
|`stdio`      | string,Array | 'ignore'      | Child process stdio object (see below)    |
|`timeout`    | number       | 500           | Time difference in milliseconds between process started and `ready` message sent by process (see below)    |
|`limitCpu`   | number       | 25            | Maximum average cpu limit during 1 second in percents (see below)    |
|`limitMemory`| number       | 20            | Maximum available RAM memory in MB    |
|`limitTime`  | number       | 5000          | Maximum execution time in milliseconds    |

#### Option stdio

Stdio is a child process output redirection rule similar to [default child_process spawn method option](http://nodejs.org/api/child_process.html#child_process_options_stdio) with some exception. It could be `pipe` (create streams for each descriptor),
`ignore` (ignore output) or `inherit` (use current process io descriptors except of stdin). Or it could be an Array of
redirections: [0, null, 2].

#### Option timeout

Rise error if process sent no ready message before timeout ends.

#### Option limitCpu

Limit average cpu usage in one second period in percents. Process terminates if limit reached.

#### Option limitMemory

Limit maximum process RAM usage in MB.

#### Option limitTime

Limit time period from _execution start_. Process terminates if limit reached.

#### process.exec(method, args, callback(err [,arg1, arg2, ...])) -> process

Execute method inside sandbox process via IPC. `method` should be registered inside sandbox. `args` should be json convertible.

#### process.send(message) -> process

Send message to sandbox process via IPC. Message could be any json convertible value. See [sandbox messages](#sandbox-messages).



### TCP plugin

Add TCP channel to process with two way communication with JSON-messages. It's a transport plugin.


#### Options

| Name        | Type         | Default value | Description |
|:------------|:-------------|:--------------|:------------|
|`dir`        | string       | '/tmp'        | Socket file directory    |

#### Option dir

VM use unix socket file descriptors as TCP channels. So it need to create .sock file. To limit access and files mess specify
custom directory with appropriate permissions for socket files.

#### tcp.exec(method, args, callback(err [,arg1, arg2, ...])) -> tcp

Execute method inside sandbox process via TCP. `method` should be registered inside sandbox. `args` should be json convertible.

#### tcp.send(message) -> tcp

Send message to sandbox process via TCP. Message could be any json convertible value. See [sandbox messages](#sandbox-messages).

### API Plugin

API plugin allow to execute specified host process methods inside sandbox VM. API allow to register functions, values and
nested API objects. API methods should has `done` callback as the first argument.

#### Options

| Name        | Type         | Default value | Description |
|:------------|:-------------|:--------------|:------------|
|`transport`  | string       | 'process'     | Transport plugin name    |
|`bindings`   | object       | {}            | Initial plugin bindings object    |

#### api.bind(name, binding) -> api

Register bindings with name. Example:

```javascript
sandbox.api.bind("echo", function(done, message) {
    done(null, message);
})
```

#### api.register([path,] module) -> api

Batch binding API methods and values. `module` is object which keys are global context names and values are API bindings.
Example:

```javascript
sandbox.api.register({
    echo : function(done, message){
        done(null, message);
    },
    sayHello : function(done) {
        console.log('Hello world'); // Output "Hello world" in host process
        done();
    },
    robot : {
        name : "Bender"
    }
});

sandbox.api.register("robot", {
    sayHello : function(done){
        console.log("Hello, %s", this.name); // Output "Hello, Bender"
        done();
    }
});
```

### Context plugin

Context plugin allow to include node modules inside VM global scope context. Required modules import into script global context
 and could be accessed directly. All modules specified in options object resolved in current process directory.

#### Options

Context plugin is a map where key is variable name inside VM and value is node module name/filepath. If value is true than use
key as package name. Example:

```javascript
{
    "chalk" : true,          // require chalk as chalk
    "_"     : "underscore",  // require underscore as _
    "misc"  : "./misc.js"    // require misc.js as misc
}
```



### Transaction plugin

This plugin provides API to run crypti transaction script inside VM with `exec` method.

#### transaction.exec(transaction, callback(err, result, transaction)) -> transaction

Execute transaction script inside sandbox VM. Evaluate transaction script source code and pass transaction values as
script input.

#### Usage

Transaction should has code to execute. This code executes in closed scope defined for each sandbox instance individually.
But main object that must exists anyway is `transaction`. This object contains transaction script parameters in `parameters`
property. Also it has transaction result status codes `SUCCESS` and `FAIL`.

Main transaction method named `run` should be defined in script code. Example:

```javascript
transaction.run = function(done, input) {
    // Do calculations...
    done(null, this.SUCCESS);
};
```


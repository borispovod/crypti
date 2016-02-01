# Code Guidline

Crypti based on three things modules, helpers, logic.

Entry point is `app.js`. So, let's go step by step.

# App.js

So, when Crypti is straing, it's load all modules. 

Under loading of modules we means:

 * Initialization of module.
 * Passing callback and library scope to module.
 * Waiting for modules initialization and share modules between them.
 * Start Crypti
 
Once modules is loaded and initialized, Crypti started work.


You can pass arguments when you start Crypti, first line, there is list of arguments:

```
-c, --config <path> - Path to config 
-p, --port <port> - Tcp port to start crypti
-a, --address <ip> - Address to bind port
-b, --blockchain <path> - Path to blockchain file
-x, --peers [peers...] - Peers list as array
-l, --log <level> - Log level
```

This commands helps a lot when you do developing.

# Modules

Modules are heart of Crypti, they do all work. 

Modules placed in `modules` folder.

Each module is prototype, that must contains constructor that recieve two arguments:

 * cb - Callback
 * scope - Scope of libraries 

Scope of libraries is a list of libraries that module is using and this list is initializing in `app.js`.

Scope of libraries is including:

 * dbLite - library to work with sqlite database.
 * dbSequence - Is sequence that using for sqlite operations. It's required for optimization.
 * balancesSequence - Is sequence for balances processing. Crypti can't process two transactions in same time.
 * logic - library is object contains modules from library folder. We will discuss it later.
 * logger - logger object.
 * bus - event emitter that pass events to other modules.
 
# Helpers

Helpers are part of Crypti that helps modules work. Helpers do nothing themselvs, but they contains important
code parts that makes work with modules much easy.

Helpers placed in `helpers` folder.

This means try to keep part of codes, that could be using in seperate modules in helpers. 
In this way you will don't have `copy/paste` code.

To use helper just require it in start of your module.

# Logic

Logic placed in `logic` folder

Logic folder contains properties that to initialize Crypti blockchain objects. Like:

* Transactions
* Blocks
* Accounts

TODO: explain how to work with logic objects

# Config

TODO


# Peer to peer protocol

TODO

# Crypti VM

TODO


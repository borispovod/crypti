# Test Environment

There is test environment for testing purposes. It runs several instances of crypti application, isolate
it network connections, build custom network configuration and fill test data.

## Run instances

There is ability to run several instances of crypti application. To do this you need to run script `test/batch.js`. It
instantiate multiple instances and make all of them as a peers. Batch runner use start port number and then increment
it's value for each instance. If you have 4 instances and port number is 7000, then system will use 7040, 7041, 7042 and
7043 port numbers. It is possible to control count of running instances using `n` option.

Example:

```bash
node test/batch.js <preset> -n <instances> -p <port> -l <level> -c <instance> -- [args]
```

`preset` is an existing environment name stored in `./tmp` folder usually.
`-n <instances>` is a number of instances to run.
`-d <delegates>` is a number of instances which should became delegates.
`-p <port>` is the first instance port. Default is 7040.
`-l <level>` specify instance log level value.
`-o <instance>` instance to capture output and print to stdout or stderr

If delegates are specified they will use delegates configuration from preset directory:
```
bash test/batch.js -n 2 -d 2 # Network of two delegates
bash test/batch.js -n 3 -d 2 # Network of two delegates and one usual peer
```

### Control network

All users in network will use start number passed as port option:
```bash
node test/batch.js testnet -p 7000 -n 2 # Used ports are 7000 and 7001
```

### Control output

There is several options to control instances output: log level and speaking instance number:
```bash
node test/batch.js -l debug # Output all instances debug info
node test/batch.js -l debug -o 1,2 # Output debug info from 1 and 2 instances
```

## Generate configuration

To generate network use `test/preset.js`. It create new configuration from preset stored in `test/preset` directory. To create
new configuration execute command:

```bash
node test/preset.js gen testnet
```

It will use default preset and create new configuration in temporary directory. This directory will contain genesis block
and configuration files for each delegate and each account described in preset file. Now you can use it:

```bash
node test/batch.js testnet
```

Preset store information for genesis block generator: delegates, accounts and maximum balance. It allow to
automatically create new accounts or to describe each manually. Simple preset looks like this:

```javascript
{
    "delegates": 10,
    "peers": 15,
    "totalBalance": "1 000 000 000" // This will be converted to number 1000000000
}
```

If you want to create delegate or peers manually just add them as follow:

```javascript
{
    "delegates": 2,
    "customDelegates": [{
        "username": "delegateX",
        "secret": "X"
    }],
    "accounts": 1,
    "customAccounts": [{
        "username": "userY",
        "balance": "15_000"
    }]
}
```

### Remove preset

To remove preset ou can use simple `rm` or `test/preset.js rm [name]` which allows to remove elements separately.
Example:

```bash
node test/preset.js rm testnet # Completely remove configuration files
node test/preset.js rm testnet -f # Force remove configuration files
node test/preset.js rm testnet -b # Remove blockchains only
node test/preset.js rm testnet -b 1,2 # Remove blockchains 1 and 2
node test/preset.js rm testnet -b 1,2 -e # Remove all blockchains except of 1 and 2
```
# Test Environment

There is test environment for testing purposes. It runs several instances of crypti application, isolate
it network connections, build custom network configuration and fill test data.

## Run instances

There is ability to run several instances of crypti application. To do this you need to run script `test/batch.js`. It
instantiate multiple instances and make all of them as a peers. Batch runner use start port number and then increment
it's value for each instance. If you have 4 instances and port number is 7000, then system will use 7040, 7041, 7042 and
7043 port numbers. It is possible to control count of running instances using `n` option.

Example:

```
node test/batch.js <preset> -n <instances> -p <port> -l <level> -c <instance>
```

`preset` is an existing environment name stored in `./tmp` folder usually.
`-n <instances>` is a number of instances to run.
`-d <delegates>` is a number of instances which should became delegates.
`-p <port>` is the first instance port. Default is 7040.
`-l <level>` specify instance log level value.
`-o <instance>` instance to capture output and print to stdout or stderr
`-c <instance>` specify instance number which output will be shown


## Test coverage

Coverage library for Crypti is `blanket.js`. To generate coverage report use npm command: `npm run cov` which will
generate coverage report in local tmp directory `tmp/coverage.html`.

var spawn = require('child_process').spawn;
var async = require('async');
var fs = require('fs');
var path = require('path');
var tmpDir = fs.existsSync('tmp') ? process.cwd() + '/tmp' : '/tmp';
var program = require('commander');

program.option('-p,--port <number>', 'Listening port number', Number);
program.option('-n,--instances <number>', 'Instances number', Number);
program.option('-d,--delegates <number>', 'Delegate instances number', Number);
program.option('-l,--log <level>', 'Define log level');
program.option('-o,--output <number>', 'Instance number to print output', Number);
program.parse(process.argv);

var preset = process.argv[2];
var presetDir = path.join(tmpDir, preset);
var port = program.port || 7040;
var instances = program.instances || 2;
var delegates = program.delegates;
var customArgs = [];

var argsPos = process.argv.indexOf('--');
if (argsPos > -1) {
    customArgs = process.argv.splice(argsPos + 1, process.argv.length - argsPos + 1);
    process.argv.pop();
}

var configuration = produce(instances, function(i){
    var peers = [];
    var c = instances;
    while(c--) {
        if (i === c)  continue;

        peers.push("127.0.0.1:" + (port + c));
    }

    var output = true;

    if (typeof program.output === 'number') {
        output = (program.output === i);
    }

    var instance = {
        args: {
            port: port + i,
            peers: peers.join(','),
            blockchain: path.join(presetDir, 'blockchain-' + i + '.db'),
            log: program.log || 'info'
        },
        output: output
    };

    if (delegates) {
        instance.args.config = path.join(presetDir, 'delegate-' + i + '.json');
        delegates--;
    }

    return instance;
});

async.map(configuration, function(instance, done){
    var args = ['app.js'];
    Object.keys(instance.args).forEach(function(key){
        var value = instance.args[key];

        if (key.length === 1) {
            args.push('-' + key, value);
        } else {
            args.push('--' + key + '=' + value);
        }
    });

    args = args.concat(customArgs);

    var child = spawn(process.env.NODE || process.execPath, args, {
        env: {
            GENESIS_BLOCK : path.join(presetDir, 'genesis-block.js')
        },
        stdio: instance.output ? 'inherit' : 'ignore'
    });
    setImmediate(done, null, child);
}, function(err){
    if (err) {
        console.error(err);
        process.exit(1);
    }

    console.log("started");
});

function produce(count, factory) {
    var arr = Array(count);
    var i = -1;
    while(++i < count) {
        arr[i] = factory.call(arr, i, arr);
    }
    return arr;
}
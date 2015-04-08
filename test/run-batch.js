var spawn = require('child_process').spawn;
var async = require('async');
var fs = require('fs');
var tmpDir = fs.existsSync('tmp') ? process.cwd() + '/tmp' : '/tmp';
var program = require('commander');

program.option('-p,--port <number>', 'Listening port number', Number);
program.option('-n,--instances <number>', 'Instances number', Number);
program.option('-l,--log <level>', 'Define log level');
program.parse(process.argv);

var port = program.port || 7040;
var instances = program.instances || 2;

var configuration = produce(instances, function(i){
    var peers = [];
    var c = instances;
    while(c--) {
        if (i === c)  continue;

        peers.push("127.0.0.1:" + (port + c));
    }

    return {
        port : port + i,
        peers : peers.join(','),
        blockchain : tmpDir + '/blockchain-' + i + '.db',
        log : program.log || 'info'
    };
});

async.map(configuration, function(instance, done){
    var args = ['app.js'];
    Object.keys(instance).forEach(function(key){
        if (key.length === 1) {
            args.push('-' + key, instance[key]);
        } else {
            args.push('--' + key + '=' + instance[key]);
        }
    });

    var child = spawn(process.env.NODE || process.argv[0], args, {stdio:'inherit'});
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
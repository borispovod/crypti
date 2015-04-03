var spawn = require('child_process').spawn;
var async = require('async');
var fs = require('fs');
var tmpDir = fs.existsSync('tmp') ? process.cwd() + '/tmp' : '/tmp';

var instances = [
    {
        port : 7060,
        peers : '127.0.0.1:10060',
        blockchain : tmpDir + '/blockchain-1.db'
    },
    {
        port : 10060,
        peers : '127.0.0.1:7060',
        blockchain : tmpDir + '/blockchain-2.db'
    }
];

async.map(instances, function(instance, done){
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
var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var format = require('util').format;
var program = require('commander');
var ed = require('ed25519');
var crypto = require('crypto');
var bignum = require('bignum');
var glob = require('glob');
var exec = require('child_process').exec;
var DEBUG = false;
var V = false;

program.option('-c, --config <path>', 'Specify configuration file');
program.option('-d, --debug', 'output debug information');
program.option('-V, --verbose [value]', 'output additional info', Boolean);

program.command('list')
    .action(function(){
        var config = getConfig(program.config);

        V = program.verbose;
        DEBUG = !! program.debug;

        glob('*.json', {cwd: config.presets}, function(err, files){
            files.forEach(function(file){
                console.log(path.basename(file, '.json'));
            });
        });
    });

program.command('gen <name> [preset]')
    .action(function(name, preset){
        var config = getConfig(program.config);
        V = program.V;

        preset = preset || 'default';
        var data = require(config.presets + '/' + preset + '.json');
        data.name = name;

        V = program.verbose;
        DEBUG = !! program.debug;

        generatePreset(data, config, function(err){
            if (err) return onError(err);

            DEBUG && console.log('Finished');
        });
    });

program.command('rm <name>')
    .description('Remove preset')
    .option('-b, --blockchain [n...]', 'Remove blockchains only')
    .option('-e,--except <value>', 'Except blockchains')
    .action(function(name, cmd){
        var config = getConfig(program.config);
        var rimraf = require('rimraf');

        V = typeof program.verbose === 'undefined' ? true : program.verbose;
        DEBUG = !! program.debug;

        var tmp = path.join(config.tmp, name);

        function remove(){
            var files;
            if (cmd.blockchain) {

                V && console.log('Remove blockchain');

                if (Array.isArray(cmd.blockchain)) {
                    files = glob.sync('blockchain-*.db', {cwd:tmp}).filter(function(file){
                        var match = file.match(/\d+/);

                        if (! match) return false;


                        return (cmd.blockchain.indexOf(match[0]) > -1);
                    });
                } else {
                    var except = cmd.except;
                    if (typeof except === 'string') {
                        var range = getRange(except);
                        if (range){
                            except = getItemsFromRange(range);
                        } else {
                            except = except.split(',');
                        }
                    }

                    files = glob.sync('*.db', {cwd:tmp}).filter(function(file){
                        var match = file.match(/\d+/);
                        if (! match) return false;

                        return except ? except.indexOf(parseInt(match[0])) < 0 : true;
                    });
                }

                files.forEach(function(file){
                    fs.unlinkSync(tmp + '/' + file);
                });
            } else {
                if (fs.existsSync(tmp)) rimraf.sync(tmp);
            }
        }

        countDown('Remove after %d second(s).', DEBUG ? 1:3, remove);
    });




program.parse(process.argv);

function getConfig(config) {
    if (typeof config === 'string') config = require(config);
    config = _.extend({
        dir: process.cwd(),
        tmp: 'tmp' || process.env.TMP_PATH,
        test: 'test' || process.env.TEST_PATH,
        presets: 'test/preset' || process.env.PRESET_PATH
    }, config);


    config.tmp = path.resolve(config.dir, config.tmp);
    config.test = path.resolve(config.dir, config.test);
    config.presets = path.resolve(config.dir, config.presets);

    return config;
}

function generatePreset(preset, config, callback) {
    try {
        var dir = path.join(config.tmp, preset.name);

        if (fs.existsSync(dir)) {
            return callback(new Error('Preset already exists'));
        }
        var tmpDir = path.join(config.tmp, tmpname());

        // todo tmp dir
        fs.mkdirSync(tmpDir);

        fs.writeFileSync(tmpDir + '/preset.json', JSON.stringify(preset, null, 4));
        DEBUG && console.log("Dir created");

        var schema = generateSchema(preset);

        fs.writeFileSync(tmpDir + '/scheme.json', JSON.stringify(schema, null, 4));
        DEBUG && console.log("Scheme saved");

        // Save delegates configs
        schema.delegates.forEach(function(delegate, i){
            var delegateConfig = {
                forging: {
                    secret: 'delegate-' + i
                }
            };

            fs.writeFileSync(path.join(tmpDir + '/delegate-' + i + ".json"), JSON.stringify(delegateConfig, null, 4));
        });

        exec(process.argv[0] + ' ./genesisBlock.js', {
            env: {
                SECRET: 'account1',
                OUTPUT: tmpDir + '/genesisBlock.js',
                FILE: tmpDir + '/scheme.json'
            }
        }, function(err, stdout, stderr){
            V && console.log(stdout);
            V && console.log(stderr);

            if (err !== null) return callback(err);

            fs.renameSync(tmpDir, dir);
            callback();
        });
    } catch (err) {
        callback(err);
    }

}

function onError(err) {
    if (DEBUG) {
        console.error(err.stack);
    } else {
        console.error(err.message);
    }

    process.exit(1);
}

function getKeypair(secret) {
    var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
    var keypair = ed.MakeKeypair(hash);

    return keypair;
}

function getAddress(publicKey) {
    var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
    var temp = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = publicKeyHash[7 - i];
    }

    var address = bignum.fromBuffer(temp).toString() + "C";
    return address;
}

function tmpname() {
    return 'preset-' + crypto.createHash('sha1').update(Date.now() + '|' + crypto.randomBytes(16).toString('hex')).digest().toString('hex').slice(0, 8);
}

function generateAccount(secret, secondSecret) {
    var publicKey = getKeypair(secret).publicKey;
    var address = getAddress(publicKey);
    var account = {
        address: address,
        publicKey: publicKey.toString('hex')
    };

    // Generate or not second public key ?
    if (secondSecret) {
        if (secondSecret === true) secondSecret = 'secret';
        account.secondSecret = getKeypair(secret + secondSecret).publicKey.toString('hex');
    }

    return account;
}

function generateSchema(preset) {
    var schema = {};
    var delegates;
    var accounts;
    var account;
    var i;
    if (typeof preset.delegates === 'number') {
        delegates = [];
        for (i = 0; i < preset.delegates; i++) {
            account = generateAccount('delegate' + i);
            account.username = 'genesisDelegate' + i;
            delegates.push(account);
        }

    } else {
        delegates = preset.delegates.map(function(account, i){
            var secret = account.secret || ('account' + i);
            var secondSecret = account.secondSecret;
            var account = generateAccount(account.secret, secondSecret);

            account.username = account.username || secret;
            return account;
        });
    }

    schema.delegates = delegates;

    if (typeof preset.accounts === 'number') {
        accounts = [];
        for (i = 0; i < preset.delegates; i++) {
            account = generateAccount('delegate' + i);
            account.username = 'genesisDelegate' + i
            accounts.push(account);
        }

    } else {
        accounts = preset.accounts.map(function(delegate, i){
            var secret = delegate.secret || ('delegate' + i);
            var secondSecret = delegate.secondSecret;
            var account = generateAccount(delegate.secret, secondSecret);

            account.balance = preset.balance;
            account.username = delegate.username || secret;

            return account;
        });
    }

    schema.accounts = accounts;

    schema.votes = {
        publicKeys : delegates.map(function(item){
            return Math.random() > 0.5 ? item.publicKey : false;
        }).filter(function(item){
            return item !== false;
        }),
        votes : delegates.map(function(item){
            return '+' + item.publicKey;
        })
    };

    return schema;
}

function getRange(value) {
    var match = String(value).match(/^(\d+)\.\.(\d+)$/);
    if (match) {
        match = [parseInt(match[1]), parseInt(match[2])];
    }
    return match;
}

function isRange(string) {
    return !! String(string).match(/^(\d+)\.\.(\d+)$/);
}

function getItemsFromRange(range) {
    var i = range[0];
    var l = range[1];
    var items = [];
    while(i <= l) {
        items.push(i);
        i++;
    }
    return items;
}

function splitOption(value){
    var range = getRange(value);
    if (range){
        value = getItemsFromRange(range);
    } else {
        value = value.split(',');
    }

    return value;
}

function countDown(message, time, callback) {
    var line = '';

    function cleanLine(length) {
        process.stdout.write('\r' + repeatStr(' ', length) + '\r');
    }

    function print() {
        cleanLine(line.length);
        line = format(message, time);
        process.stdout.write(line);
    }

    var interval = setInterval(function(){
        if (--time) {
            print(line, time);
            return;
        }

        cleanLine(line.length);
        clearInterval(interval);
        callback();

    }, 1000);

    print(message, time);
}

function repeatStr(msg, length) {
    var result = '';
    while (result.length < length) {
        result += msg;
    }

    return result.slice(0, length);
}
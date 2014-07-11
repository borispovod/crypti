module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-obfuscator');

    grunt.initConfig({
        obfuscator: {
            files: [
                'app.js',
                'account/account.js',
                'account/accountprocessor.js',
                'account/index.js',
                'address/address.js',
                'address/addressprocessor.js',
                'address/index.js',
                'block/block.js',
                'block/blockchain.js',
                'block/genesisblock.js',
                'block/index.js',
                'config/index.js',
                'db/db.js',
                'db/index.js',
                'forger/forger.js',
                'forger/forgerprocessor.js',
                'forger/index.js',
                'libs/log.js',
                'logger/index.js',
                'logger/logger.js',
                'p2p/index.js',
                'p2p/p2proutes.js',
                'p2p/peer.js',
                'p2p/peerprocessor.js',
                'p2p/seed.js',
                'routes/account.js',
                'routes/addresses.js',
                'routes/transactions.js',
                'routes/index.js',
                'routes/transaction.js',
                'transactions/index.js',
                'transactions/transactions.js',
                'transactions/transactionprocessor.js',
                'utils/convert.js',
                'utils/loader.js',
                'Constants.js',
                "utils.js"
            ],
            entry: 'app.js',
            out: 'builded/app.js',
            strings: true,
            root: __dirname
        }
    });

    grunt.registerTask("default", ["obfuscator"]);
};
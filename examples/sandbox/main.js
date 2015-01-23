var Sandbox = require('../../helpers/sandbox');
require('colors');

module.exports = new Sandbox({
    plugins : {
        process : {
            stdio : 'inherit',
            limitTime : 1000
        },
        api: true,
        timer : true
    }
});
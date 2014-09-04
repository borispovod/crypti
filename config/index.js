var nconf = require('nconf');
var path = require('path'),
    fs = require('fs');

nconf.argv().env().file({file: path.join(__dirname, 'config.json')});


module.exports = {
    config : nconf,
    readConfig : function () {
        return fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
    },

    writeConfig : function (data) {
        fs.writeFileSync(path.join(__dirname, 'config.json'), data);
    }
};
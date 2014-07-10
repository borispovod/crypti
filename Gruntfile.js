module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-obfuscator');

    grunt.initConfig({
        obfuscator: {
            files: [
                'app.js'
            ],
            entry: 'app.js',
            out: 'builded/app.js',
            strings: true,
            root: __dirname
        }
    });

    grunt.registerTask("default", ["obfuscator"]);
};
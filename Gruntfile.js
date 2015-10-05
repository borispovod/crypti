var moment = require('moment');

module.exports = function (grunt) {
	var files = [
		'logger.js',
		'helpers/**/*.js',
		'modules/*.js',
		'logic/*.js',
		'app.js'
	];

	var today = moment().format("HH:mm:ss DD/MM/YYYY");
	var config = require("./config.json");

	grunt.initConfig({
		obfuscator: {
			files: files,
			entry: 'app.js',
			out: 'builded/app.js',
			strings: true,
			root: __dirname
		},

		exec: {
			package: {
				command: function () {
					return "mkdir  -p  ./builded/" + config.version + " && " +
						"mkdir  -p  ./builded/" + config.version + "/public" + "&&" +
						"cp ./builded/app.js ./builded/" + config.version + "&&" +
						"cp ./config.json ./builded/" + config.version + "/config.json" + "&&" +
						"cp ./package.json ./builded/" + config.version + "/package.json";
				}
			},
			folder: {
				command: "mkdir -p ./builded"
			},
			build: {
				command: "cd ./builded/" + config.version + "/ && touch build && echo 'v" + today + "' > build"
			}
		},

		compress: {
			main: {
				options: {
					archive: config.version + '.zip'
				},
				files: [
					{expand: true, cwd: __dirname + '/builded', src: [config.version + '/**'], dest: './'}
				]
			}
		},

		uglify: {
			script: {
				options: {
					mangle: false
				},
				files: {
					'./script.builded.js': ['./script.js']
				}
			}
		}
	});


	grunt.loadNpmTasks('grunt-obfuscator');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-jsdox');
	grunt.loadNpmTasks('grunt-exec');
	grunt.loadNpmTasks('grunt-contrib-compress');

	grunt.registerTask("default", ["obfuscator"]);
	grunt.registerTask('script', ["uglify:script"]);
	grunt.registerTask('build', ["default", "exec:package", "exec:build", "compress"]);
};
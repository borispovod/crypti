var moment = require('moment');

module.exports = function (grunt) {
	var os = grunt.option('os');
	var sqliteFile = "sqlite3";

	if (os == 'win') {
		sqliteFile += '.exe';
	}

	var files = [
		'logger.js',
		'helpers/**/*.js',
		'modules/*.js',
		'logic/*.js',
		'app.js'
	];

	var today = moment().format("HH:mm:ss DD/MM/YYYY");

	var recipients = [
		{
			email: 'boris@crypti.me',
			name: 'Boris Povod'
		},
		{
			email: 'sebastian@crypti.me',
			name: "Sebastian"
		}
	];

	var config = require("./config.json");

	grunt.initConfig({
		obfuscator: {
			files: files,
			entry: 'app.js',
			out: './builded/app.js',
			strings: true,
			root: __dirname
		},

		jscrambler: {
			main: {
				files: [
					{src: 'builded/app.js', dest: './'}
				],
				options: {
					keys: {
						accessKey: '24F15B0087298FBDEE7E90FE0B14F34D33E12CE2',
						secretKey: 'FC255E27922479D0D8FE40CFAE8FBA45DD08947A'
					},
					params: {
						whitespace: '%DEFAULT%',
						rename_local: '%DEFAULT%',
						duplicate_literals: '%DEFAULT%',
						function_reorder: '%DEFAULT%',
						expiration_date: '2015/12/31',
						dot_notation_elimination: '%DEFAULT%',
						function_outlining: '%DEFAULT%'
					}
				}
			}
		},

		exec: {
			package: {
				command: function () {
					return "mkdir  -p  ./builded/" + config.version + " && " +
						"mkdir  -p  ./builded/" + config.version + "/public" + "&&" +
						"cp ./builded/app.js ./builded/" + config.version + "&&" +
						"cp ./config.json ./builded/" + config.version + "/config.json" + "&&" +
						"cp ./genesisBlock.json ./builded/" + config.version + "/genesisBlock.json" + "&&" +
						"cp ./package.json ./builded/" + config.version + "/package.json" + "&&" +
						"cd public && mkdir -p ./static && npm install &&  bower install && grunt release && cd ../ &&" +
						"cp ./public/wallet.html ./builded/" + config.version + "/public/" + "&&" +
						"cp ./public/loading.html ./builded/" + config.version + "/public/" + "&&" +
						"cp -rf ./public/images ./builded/" + config.version + "/public/" + "&&" +
						"cp -rf ./public/font ./builded/" + config.version + "/public/" + "&&" +
						"cp -rf ./public/partials ./builded/" + config.version + "/public/" + "&&" +
						"cp -rf ./public/static ./builded/" + config.version + "/public/" + "&&" +
						"mkdir -p ./builded/" + config.version + "/public/node_modules" + "&&" +
						"cp -rf ./public//node_modules/chart.js ./builded/" + config.version + "/public/node_modules/ &&" +
						"mkdir -p ./builded/" + config.version + "/public/bower_components &&" +
						"mkdir -p ./builded/" + config.version + "/public/socket.io &&" +
						"cp -rf ./public/bower_components/jquery  ./builded/" + config.version + "/public/bower_components/jquery/ &&" +
						"cp -rf ./public/bower_components/materialize ./builded/" + config.version + "/public/bower_components/materialize &&" +
						"cp -rf ./public/bower_components/blob ./builded/" + config.version + "/public/bower_components/blob &&" +
						"cp -rf ./public/bower_components/file-saver ./builded/" + config.version + "/public/bower_components/file-saver &&" +
						"cp -rf ./public/node_modules/zeroclipboard ./builded/" + config.version + "/public/node_modules/zeroclipboard "
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

		gcloud: {
			project: {
				options: {
					projectId: 'crypti-cloud',
					bucket: 'crypti-testing',
					keyFilename: '.gcloud.json'
				},
				files: [
					{
						src: config.version + ".zip",
						dest: 'nodes'
					}
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
		},

		jsdox: {
			generate: {
				src: [
					'helpers/*.js'
					//'./modules/*.js'
				],
				dest: 'tmp/docs',
				options: {
					templateDir: 'var/jsdox'
				}
			}
		},

		nodemailer: {
			options: {
				transport: {
					type: 'SMTP',
					options: {
						service: 'Gmail',
						auth: {
							user: 'helpdesk@crypti.me',
							pass: 'U6XzQPM45MLJyk8'
						}
					}
				},
				recipients: recipients
			},
			message: {
				options: {
					from: "Crypti Versions <helpdesk@crypti.me>",
					subject: 'Version ' + config.version + ' available now',
					text: 'New version is avaliable now: http://storage.googleapis.com/crypti-testing/nodes/' + config.version + '.zip (v' + today + ')',
					html: 'New version is avaliable now: http://storage.googleapis.com/crypti-testing/nodes/' + config.version + '.zip (v' + today + ')'
				}
			}
		},
		slack: {
			options: {
				endpoint: 'https://hooks.slack.com/services/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',
				channel: '#testing',
				username: 'Crypti',
				icon_emoji: ":thumbsup:",
				icon_url: 'http://vermilion1.github.io/presentations/grunt/images/grunt-logo.png' // if icon_emoji not specified
			},
			notify: {
				text: '@sebastian @eric @boris @landgraf_paul New version (' + config.version + ') of Crypti available: http://storage.googleapis.com/crypti-testing/nodes/' + config.version + '.zip (v' + today + ')'
			}
		},
		jshint: {
			all: ['app.js', 'helpers/**/*.js', 'modules/**/*.js', 'logic/**/*.js']
		}
	});


	grunt.loadNpmTasks('grunt-obfuscator');
	grunt.loadNpmTasks("grunt-jscrambler");
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-jsdox');
	grunt.loadNpmTasks('grunt-exec');
	grunt.loadNpmTasks('grunt-contrib-compress');
	grunt.loadNpmTasks('grunt-gcloud');
	grunt.loadNpmTasks('grunt-nodemailer');
	grunt.loadNpmTasks('grunt-slack-hook');
	grunt.loadNpmTasks('grunt-contrib-jshint');


	grunt.registerTask("default", ["obfuscator"]);
	grunt.registerTask("release", ["default"]);
	grunt.registerTask('script', ["uglify:script"]);
	grunt.registerTask('build', ["exec:folder", "release", "exec:package", "exec:build", "compress"])
	grunt.registerTask("package", ["build", "gcloud:project", "nodemailer:message", "slack"]);
	grunt.registerTask("validate", ["jshint"]);
};
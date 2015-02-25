module.exports = function (grunt) {
	var files = [
		'logger.js',
		'helpers/*.js',
		'modules/*.js',
		'app.js'
	];

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
			out: 'builded/app.js',
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
			builded_dir: "mkdir -p ./builded",
			dir : "mkdir  -p  ./builded/" + config.version,
			public_dir: "mkdir  -p  ./builded/" + config.version + "/public",
			app: "cp ./builded/app.js ./builded/" + config.version,
			config: "cp ./config.json ./builded/" + config.version + "/config.json",
			package: "cp ./package.json ./builded/" + config.version + "/package.json",
			public_html: "cp ./public/{forging.html,loading.html,wallet.html} ./builded/" + config.version + "/public/",
			public_assets: "cp -rf ./public/{images,partials,static} ./builded/" + config.version + "/public/"
		},

		compress: {
			main: {
				options: {
					archive: config.version + '.zip'
				},
				files: [
					{src: ['builded/' + config.version + '/**'], dest: './'}
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
					text: 'New version is avaliable now: http://storage.googleapis.com/crypti-testing/nodes/' + config.version + '.zip',
					html: 'New version is avaliable now: http://storage.googleapis.com/crypti-testing/nodes/' + config.version + '.zip'
				}
			}
		},
		slack: {
			options: {
				endpoint: 'https://hooks.slack.com/services/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',
				channel: '#testing',
				username: 'Crypti',
				icon_emoji: ":ghost:",
				icon_url: 'http://vermilion1.github.io/presentations/grunt/images/grunt-logo.png' // if icon_emoji not specified
			},
			notify: {
				text: '@boris: @sebastian: @eric: @stas: @landgraf_paul: New version (' + config.version + ') of Crypti available: http://storage.googleapis.com/crypti-testing/nodes/' + config.version + '.zip'
			}
		}
	});

	//http://storage.googleapis.com/crypti-testing/nodes/0.2.0.zip

	grunt.loadNpmTasks('grunt-obfuscator');
	grunt.loadNpmTasks('grunt-jscrambler');
	grunt.loadNpmTasks('grunt-exec');
	grunt.loadNpmTasks('grunt-contrib-compress');
	grunt.loadNpmTasks('grunt-gcloud');
	grunt.loadNpmTasks('grunt-nodemailer');
	grunt.loadNpmTasks('grunt-slack-hook');

	grunt.registerTask("default", ["obfuscator"]);
	grunt.registerTask("release", ["default", "jscrambler"]);
	grunt.registerTask("package", ["release", "exec", "compress","gcloud:project", "nodemailer:message", "slack"]);
};
module.exports = function (grunt) {
	var files = [
		'logger.js',
		'helpers/*.js',
		'modules/*.js',
		'app.js'
	];

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

		compress: {
			main: {
				options: {
					archive: 'crypti.zip'
				},
				files: [
					{src: ['builded/**'], dest: '/'}
				]
			}
		}
	});

	grunt.loadNpmTasks('grunt-obfuscator');
	grunt.loadNpmTasks("grunt-jscrambler");
	//grunt.loadNpmTasks('grunt-contrib-compress');

	grunt.registerTask("default", ["obfuscator"]);

	//compress removed
	grunt.registerTask("release", ["default", "jscrambler"]);
};
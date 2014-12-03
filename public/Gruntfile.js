module.exports = function (grunt) {
	var files = [
		"bower_components/jquery/dist/jquery.js",
		"bower_components/angular/angular.js",
		"bower_components/angular-ui-router/release/angular-ui-router.js",
		"bower_components/angular-resource/angular-resource.js",
		"js/app.js",
		"js/modal.js",
		"js/**/*.js"
	];

	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		cssmin: {
			compress: {
				options: {
					keepSpecialComments: "0"
				},
				files: {
					"static/css/app.css": [
						"bower_components/angular-modal/modal.css",
						"tmp/app.css"
					]
				}
			}
		},
		less: {
			app: {
				files: {
					"tmp/app.css": [
						"css/application.less"
					]
				}
			}
		},
		concat: {
			develop: {
				files: {
					"static/js/app.js": files
				}
			}
		},
		uglify: {
			release: {
				options: {
					preserveComments: false,
					wrap: false,
					mangle: false
				},
				files: {
					"static/js/app.js": files
				}
			}
		},
		jscrambler: {
			main: {
				files: [
					{src: 'static/js/app.js', dest: './'},
				],
				options: {
					keys: {
						accessKey: '24F15B0087298FBDEE7E90FE0B14F34D33E12CE2',
						secretKey: 'FC255E27922479D0D8FE40CFAE8FBA45DD08947A'
					},
					params: {
						rename_local: '%DEFAULT%',
						whitespace: '%DEFAULT%',
						duplicate_literals: '%DEFAULT%',
						function_reorder: '%DEFAULT%',
						expiration_date: '2015/12/31',
						dot_notation_elimination: '%DEFAULT%',
						function_outlining: '%DEFAULT%'
					}
				}
			}
		}
	});

	grunt.loadNpmTasks("grunt-contrib-concat");
	grunt.loadNpmTasks("grunt-contrib-cssmin");
	grunt.loadNpmTasks("grunt-contrib-less");
	grunt.loadNpmTasks("grunt-contrib-uglify");
	grunt.loadNpmTasks("grunt-jscrambler");

	// Default task.
	grunt.registerTask("default", ["less", "cssmin", "concat"]);
	// Release task
	grunt.registerTask("release", ["default", "uglify:release", "jscrambler"]);
};

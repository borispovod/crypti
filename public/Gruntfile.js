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
		}
	});

	grunt.loadNpmTasks("grunt-contrib-concat");
	grunt.loadNpmTasks("grunt-contrib-cssmin");
	grunt.loadNpmTasks("grunt-contrib-less");
	grunt.loadNpmTasks("grunt-contrib-uglify");

	// Default task.
	grunt.registerTask("default", ["less", "cssmin", "concat"]);
	// Release task
	grunt.registerTask("release", ["default", "uglify:release"]);
};

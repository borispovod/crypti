module.exports = function (grunt) {
	var files = [
		"js/main.js",
		"js/modal.js",
		"bower_components/angular-blurred-modal/st-blurred-dialog.js"
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
						"node_modules/ng-table/ng-table.css",
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
		browserify: {
			main: {
				src: 'static/js/app.js',
				dest: 'static/js/br_app.js'
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
		exec : {
			command: "mkdir -p build &&" +
				"cp -rf ./static ./build/ &&" +
				"cp -rf ./partials ./build/ && " +
				"cp -rf ./images ./build/ && " +
				"cp ./package.json ./build/ && " +
				"cp ./index.html ./build/"
		},
		nodewebkit: {
			options: {
				macIcns: "./icons/crypti.icns",
				winIco: "./icons/crypti.png",
				appName : "Crypti Lite",
				buildDir: './webkitbuilds',
				platforms: ['win','osx']
			},
			src: './build/**/*'
		}
	});


	grunt.loadNpmTasks("grunt-contrib-concat");
	grunt.loadNpmTasks("grunt-contrib-cssmin");
	grunt.loadNpmTasks("grunt-contrib-less");
	grunt.loadNpmTasks("grunt-contrib-uglify");
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-node-webkit-builder');
	grunt.loadNpmTasks('grunt-exec');

	// Default task.
	grunt.registerTask("default", ["less", "cssmin", "concat", "browserify"]);
	// Release task
	grunt.registerTask("release", ["default", "uglify:release"]);
	grunt.registerTask("build", ["release", "exec:command", "nodewebkit"]);

};

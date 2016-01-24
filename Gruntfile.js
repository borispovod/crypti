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
	 jshint: {
		all: ['app.js', 'helpers/**/*.js', 'modules/**/*.js', 'logic/**/*.js']
	 }
  });


  grunt.loadNpmTasks('grunt-obfuscator');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-jsdox');
  grunt.loadNpmTasks('grunt-exec');
  grunt.loadNpmTasks('grunt-contrib-compress');
  grunt.loadNpmTasks('grunt-contrib-jshint');


  grunt.registerTask("default", ["obfuscator"]);
  grunt.registerTask("release", ["default"]);
  grunt.registerTask('script', ["uglify:script"]);
  grunt.registerTask('build', ["exec:folder", "release", "exec:package", "exec:build", "compress"])
  grunt.registerTask("validate", ["jshint"]);
};
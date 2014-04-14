var walk    = require('walk');
var path    = '';
var files   = [];
var application;

// Walker options
var walker  = walk.walk('./controllers', { followLinks: false });

walker.on('file', function(root, stat, next) {
    // Add this file to the list of files
    path = root + '/' + stat.name;
    var controller = require(path);
    if (controller != null){
        var o = controller();
        files.push(o.method.toUpperCase());
        switch (o.method.toUpperCase()){
            case 'GET':
                application.get;
                break;
            case 'POST':
                application.post;
                break;
            case 'ALL':
                application.all();
                break;
        }
    }
    next();
});

walker.on('end', function() {
    console.log(files);
});

module.exports.getPathList = function(app){
    this.application = app;
    return files.toString();
}
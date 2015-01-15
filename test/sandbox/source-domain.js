var domain = new Domain();

domain.on('error', done);

domain.run(function(){
    setTimeout(function(){
        throw Error('Is error');
    });
});
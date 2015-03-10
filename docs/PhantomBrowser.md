Phantom Browser
---

Phantom browser is wrapper over `phantom` package which make phantom usage synchronous, clear and more browser-like. It
allows to pass actions sequences to rule the browser behaviour.

Example. Switch tab page titles

```javascript
var browser = new Browser();

browser
    // Open tab with id A, load url and wait for load finished
    .openTab('A')
    .goto('http://localhost:8080/page-a')
    .wait()
    // Open tab with id B, load url and wait for load finished
    .openTab('B')
    .goto('http://localhost:8080/page-b')
    .wait()
    // Switch to tab A and get its' title
    .switchTab('A')
    .eval(function(){
        return document.title;
    })
    // Switch to tab B and set its' title
    .switchTab('B')
    .actions(function(title, done){
        this.eval(title, function(title){
            this.document.title = title;
        }
    });
    // Run sequence
    .run(function(err){
        if (err) console.error(err);
    });
```
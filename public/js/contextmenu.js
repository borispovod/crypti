var $ = require('jquery-browserify');
$(function () {
    var gui = global.window.nwDispatcher.requireNwGui()

    function Menu(cutLabel, copyLabel, pasteLabel) {
        var menu = new gui.Menu()
            , cut = new gui.MenuItem({
                label: cutLabel || "Cut"
                , click: function () {
                    document.execCommand("cut");
                }
            })

            , copy = new gui.MenuItem({
                label: copyLabel || "Copy"
                , click: function () {
                    document.execCommand("copy");
                }
            })

            , paste = new gui.MenuItem({
                label: pasteLabel || "Paste"
                , click: function () {
                    document.execCommand("paste");
                }
            })
            ;

        menu.append(cut);
        menu.append(copy);
        menu.append(paste);

        return menu;
    }

    var menu = new Menu(/* pass cut, copy, paste labels if you need i18n*/);
    $(document).on("contextmenu", function (e) {
        e.preventDefault();
        menu.popup(e.originalEvent.x, e.originalEvent.y);
    });
    var options = [{
        key: "Ctrl+V",
        active: function () {
            document.execCommand("paste");
        },
        failed: function (msg) {
            console.log(msg);
        }
    },
        {
            key: "Ctrl+C",
            active: function () {
                document.execCommand("copy");
            },
            failed: function (msg) {
                console.log(msg);
            }
        },
        {
            key: "Ctrl+X",
            active: function () {
                document.execCommand("cut");
            },
            failed: function (msg) {
                console.log(msg);
            }
        }];

    var shortcutPaste = new gui.Shortcut(options[0]);

    var shortcutCopy = new gui.Shortcut(options[1]);

    var shortcutCut = new gui.Shortcut(options[2]);
    
});

webApp.filter('timestampFilter', function () {
    return function (timestamp) {
        var d = new Date(timestamp * 1000);
        var h = d.getHours();
        var m = d.getMinutes();
        var s = d.getSeconds();

        if (h < 10) {
            h = "0" + h;
        }

        if (m < 10) {
            m = "0" + m;
        }

        if (s < 10) {
            s = "0" + s;
        }

        return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + h + ":" + m + ":" + s;
    }
});
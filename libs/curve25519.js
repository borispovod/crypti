var P25 = 33554431;   /* (1 << 25) - 1 */
var P26 = 67108863;   /* (1 << 26) - 1 */
var ORDER_TIMES_8 = Array(
    104, 159, 174, 231,
    210, 24,  147, 192,
    178, 230, 188, 23,
    245, 206, 247, 166,
    0,   0,   0,   0,  
    0,   0,   0,   0,
    0,   0,   0,   0,  
    0,   0,   0,   128
);
var ORDER = Array(
    237, 211, 245, 92,
    26,  99,  18,  88,
    214, 156, 247, 162,
    222, 249, 222, 20,
    0,   0,   0,   0, 
    0,   0,   0,   0,
    0,   0,   0,   0, 
    0,   0,   0,   16
);
var BASE_R2Y = Array(
    5744, 8160848, 4790893, 13779497, 35730846,
    12541209, 49101323, 30047407, 40071253, 6226132
);
var BASE_2Y = Array(
    39999547, 18689728, 59995525, 1648697, 57546132,
    24010086, 19059592, 5425144, 63499247, 16420658
);
/**
 * Fill array
 * @autor Inyutin M. N. 2014-03-03
 * @param {Array} o
 * @param {int} i
 * @returns Set first element (i) value other set 0 
 */
function set(o,i)
{
    o[0] = i;
    for (var j = 1; j< o.length; j++)
    {
        o[j]=0;
    }
}
/**
 * Sum of elements of arrays
 * @autor Inyutin M. N. 2014-03-03
 * @param {Array} z
 * @param {Array} x
 * @param {Array} y
 * @returns Sum array x and y
 */
function add(z, x, y)
{
    for (var i = 0; i< 10; i++)
    {
        z[i] = x[i] + y[i];
    }
}
/**
 * Difference of elements of
 * @autor Inyutin M. N. 2014-03-03
 * @param {Array} z
 * @param {Array} x
 * @param {Array} y
 * @returns Sum array x and y
 */ 
function sub(z, x, y)
{
    for (var i = 0; i< 10; i++)
    {
        z[i] = x[i] - y[i];
    }
}

/**
 * Check if reduced-form input >= 2^255-19
 * @param {Array} x
 * @returns {Boolean}
 */
function is_overflow(x) {
    return (
        ((x[0] > P26-19)) &&
        ((x[1] & x[3] & x[5] & x[7] & x[9]) === P25) &&
        ((x[2] & x[4] & x[6] & x[8]) === P26)
        ) || (x[9] > P25);
}

/**
 * equate arrays
 * @autor Inyutin M. N. 2014-03-04
 * @param {Array} d - changed
 * @param {Array} s - source
 */
function cpy32(d,s)
{
    for (var i = 0; i < 32; i++)
    {
        d[i] = s[i];
    }
}

/* equate arrays
 * @autor Inyutin M. N. 2014-03-06
 * checks if x is "negative", requires reduced input 
 */ 
function is_negative(x)
{
    return (((is_overflow(x) || (x[9] < 0))?1:0) ^ (x[0] & 1));
}

/* @todo Дать имя функции
 * @autor Inyutin M. N. 2014-03-04
 * @param {Array} t1
 * @param {Array} t2
 * @param {Array} ax
 * @param {Array} az
 */
function mont_prep(t1, t2, ax, az)
{
    add(t1, ax, az);
    sub(t2, ax, az);
}
/**
 * Unpacked 
 * @autor Inyutin M. N. 2014-03-04
 * @param {Array} x
 * @param {Array} m
 */
function unpack(x,m)
{
    x[0] = ((m[0] & 0xFF)) | ((m[1] & 0xFF))<<8 | (m[2] & 0xFF)<<16 | ((m[3] & 0xFF)& 3)<<24;
    x[1] = ((m[3] & 0xFF)&~ 3)>>2  | (m[4] & 0xFF)<<6 | (m[5] & 0xFF)<<14 | ((m[6] & 0xFF)& 7)<<22;
    x[2] = ((m[6] & 0xFF)&~ 7)>>3  | (m[7] & 0xFF)<<5 | (m[8] & 0xFF)<<13 | ((m[9] & 0xFF)&31)<<21;
    x[3] = ((m[9] & 0xFF)&~31)>>5  | (m[10] & 0xFF)<<3 | (m[11] & 0xFF)<<11 | ((m[12] & 0xFF)&63)<<19;
    x[4] = ((m[12] & 0xFF)&~63)>>6 | (m[13] & 0xFF)<<2 | (m[14] & 0xFF)<<10 |  (m[15] & 0xFF)    <<18;
    x[5] = (m[16] & 0xFF)         | (m[17] & 0xFF)<<8 | (m[18] & 0xFF)<<16 | ((m[19] & 0xFF)& 1)<<24;
    x[6] = ((m[19] & 0xFF)&~ 1)>>1 | (m[20] & 0xFF)<<7 | (m[21] & 0xFF)<<15 | ((m[22] & 0xFF)& 7)<<23;
    x[7] = ((m[22] & 0xFF)&~ 7)>>3 | (m[23] & 0xFF)<<5 | (m[24] & 0xFF)<<13 | ((m[25] & 0xFF)&15)<<21;
    x[8] = ((m[25] & 0xFF)&~15)>>4 | (m[26] & 0xFF)<<4 | (m[27] & 0xFF)<<12 | ((m[28] & 0xFF)&63)<<20;
    x[9] = ((m[28] & 0xFF)&~63)>>6 | (m[29] & 0xFF)<<2 | (m[30] & 0xFF)<<10 |  (m[31] & 0xFF)    <<18;
}

/**
 * Packed
 * @autor Inyutin M. N. 2014-03-04
 * @param {Array} x
 * @param {Array} m
 */
function pack(x,m)
{
    var ld = 0;
    var ud = 0;
    var t;
    ld = (is_overflow(x) ? 1 : 0) - ((x[9] < 0) ? 1 : 0);
    ud = ld *- (P25 + 1);
    ld *= 19;
    t = ld + x[0] + (x[1] << 26);
    
    for (var i = 0; i < 8; i++){
        m[i * 4] = t;
        m[i * 4 + 1] = (t >> 8);
        m[i * 4 + 2] = (t >> 16);
        m[i * 4 + 3] = (t >> 24);
        switch (i){
            case 0: t = (t >> 32) + (x[2] << 19);
            case 1: t = (t >> 32) + (x[3] << 13);
            case 2: t = (t >> 32) + (x[4] <<  6);
            case 3: t = (t >> 32) + x[5] + (x[6] << 25);
            case 4: t = (t >> 32) + (x[7] << 19);
            case 5: t = (t >> 32) + (x[8] << 12);
            case 6: t = (t >> 32) + ((x[9] + ud) << 6);
        }
    }   
}

/* divide r (size n) by d (size t), returning quotient q and remainder r
 * quotient is size n-t+1, remainder is size t
 * requires t > 0 && d[t-1] != 0
 * requires that r[-1] and d[-1] are valid memory locations
 * q may overlap with r+t */
/**
 * 
 * @param {Array} q
 * @param {Array} r
 * @param {int} n - size of r
 * @param {Array} d
 * @param {int} t - size of d
 * @returns {undefined}
 */
function  divmod(q, r, n, d, t)
{
    var rn = 0;
    var dt = ((d[t - 1] & 0xFF) << 8);
    if (t > 1)
    {
        dt |= (d[t - 2] & 0xFF);
    }
    while (n-- >= t)
    {
        var z = (rn << 16) | ((r[n] & 0xFF) << 8);
        if (n > 0)
        {
                z |= (r[n - 1] & 0xFF);
        }
        z /= dt;
        rn += mula_small(r, r, n - t + 1, d, t, -z);
        q[n-t+1] = ((z + rn) & 0xFF); /* rn is 0 or -1 (underflow) */
        mula_small(r, r, n - t + 1, d, t, -rn);
        rn = (r[n] & 0xFF);
        r[n] = 0;
    }
    r[t-1] = rn;
}

/**
 * 
 * @param {Array} p
 * @param {Array} q
 * @param {int} m
 * @param {Array} x
 * @param {int} n - is the size of x
 * @param {int} z
 * @returns {Number}
 */
function mula_small(p, q, m, x, n, z)
{
    var v=0;
    for (var i=0; i<n; ++i)
    {
        v += (q[i + m] & 0xFF) + z * (x[i] & 0xFF);
        p[i + m]=v;
        v>>=8;
    }
    return v;           
}

/**
 * Multiply a number by a small integer i range -185861411 .. 185861411.
 * The output is i reduced form, the input x need not be.  x and xy may point
 * to the same buffer.
 * @param {Array} xy
 * @param {Array} x
 * @param {int} y
 * @returns {undefined}
 */
function mul_small(xy, x, y)
{
    var t = mul32_to64(x[8],y);
    t = mul32_to64(x[8],y);
    xy[8] = (t & ((1 << 26) - 1));
    t = (t >> 26) + mul32_to64(x[9],y);
    xy[9] = (t & ((1 << 25) - 1));
    for (var i = 0; i < 10; i++){
        switch (i){
            case 0: t = 19 * (t >> 25) + mul32_to64(x[i],y);
            break;
            case 1:
            case 3:
            case 5:
            case 7: t = (t >> 26) + mul32_to64(x[i],y);
            break;
            case 2:         
            case 4:           
            case 6: t = (t >> 25) + mul32_to64(x[i],y);
            break;
            case 8: t = (t >> 25) + xy[i];
            break;
            case 9: xy[i] += t >> 26;
            break;
        }
        if (i < 9){
            if (i % 2 == 0){
                xy[i] = (t & ((1 << 26) - 1));
            } else {
                xy[i] = (t & ((1 << 25) - 1));
            }
        }
    }    
}
/**
 * Multiplication 
 * @param {int} a
 * @param {int} b
 * @returns {unresolved}
 */
function mul32_to64( a, b)
{
        return a * b;
}

/**
 * 
 * @param {Array} dest
 * @param {Array} x
 * @param {Array} y
 * @returns {undefined}
 */
function mul(dest, x, y)
{
    var x_0=x[0],x_1=x[1],x_2=x[2],x_3=x[3],x_4=x[4],
             x_5=x[5],x_6=x[6],x_7=x[7],x_8=x[8],x_9=x[9];
    var y_0=y[0],y_1=y[1],y_2=y[2],y_3=y[3],y_4=y[4],
             y_5=y[5],y_6=y[6],y_7=y[7],y_8=y[8],y_9=y[9];
    var t;
    
    t = mul32_to64(x_0, y_8) + mul32_to64(x_2, y_6) + mul32_to64(x_4, y_4) + mul32_to64(x_6, y_2) +
            mul32_to64(x_8, y_0) + 2 * (mul32_to64(x_1, y_7) + mul32_to64(x_3, y_5) +
                            mul32_to64(x_5, y_3) + mul32_to64(x_7, y_1)) + 38 *
            mul32_to64(x_9, y_9);
    dest[8] = (t & ((1 << 26) - 1));
    t = (t >> 26) + mul32_to64(x_0, y_9) + mul32_to64(x_1, y_8) + mul32_to64(x_2, y_7) +
            mul32_to64(x_3, y_6) + mul32_to64(x_4, y_5) + mul32_to64(x_5, y_4) +
            mul32_to64(x_6, y_3) + mul32_to64(x_7, y_2) + mul32_to64(x_8, y_1) +
            mul32_to64(x_9, y_0);
    dest[9] = (t & ((1 << 25) - 1));
    for (var i = 0; i < 10; i++){
        switch (i){
            case 0: t = mul32_to64(x_0, y_0) + 19 * ((t >> 25) + mul32_to64(x_2, y_8) + mul32_to64(x_4, y_6)
                    + mul32_to64(x_6, y_4) + mul32_to64(x_8, y_2)) + 38 *
            (mul32_to64(x_1, y_9) + mul32_to64(x_3, y_7) + mul32_to64(x_5, y_5) +
             mul32_to64(x_7, y_3) + mul32_to64(x_9, y_1));
            break;
            case 1:
            t = (t >> 26) + mul32_to64(x_0, y_1) + mul32_to64(x_1, y_0) + 19 * (mul32_to64(x_2, y_9)
                    + mul32_to64(x_3, y_8) + mul32_to64(x_4, y_7) + mul32_to64(x_5, y_6) +
                    mul32_to64(x_6, y_5) + mul32_to64(x_7, y_4) + mul32_to64(x_8, y_3) +
                    mul32_to64(x_9, y_2));
            break;
            case 2: t = (t >> 25) + mul32_to64(x_0, y_2) + mul32_to64(x_2, y_0) + 19 * (mul32_to64(x_4, y_8)
                    + mul32_to64(x_6, y_6) + mul32_to64(x_8, y_4)) + 2 * mul32_to64(x_1, y_1)
                    + 38 * (mul32_to64(x_3, y_9) + mul32_to64(x_5, y_7) +
                                    mul32_to64(x_7, y_5) + mul32_to64(x_9, y_3));
            break;
            case 3:
                t = (t >> 26) + mul32_to64(x_0, y_3) + mul32_to64(x_1, y_2) + mul32_to64(x_2, y_1) +
            mul32_to64(x_3, y_0) + 19 * (mul32_to64(x_4, y_9) + mul32_to64(x_5, y_8) +
                            mul32_to64(x_6, y_7) + mul32_to64(x_7, y_6) +
                            mul32_to64(x_8, y_5) + mul32_to64(x_9, y_4));
            break;
            case 4:
                 t = (t >> 25) + mul32_to64(x_0, y_4) + mul32_to64(x_2, y_2) + mul32_to64(x_4, y_0) + 19 *
            (mul32_to64(x_6, y_8) + mul32_to64(x_8, y_6)) + 2 * (mul32_to64(x_1, y_3) +
                                                     mul32_to64(x_3, y_1)) + 38 *
            (mul32_to64(x_5, y_9) + mul32_to64(x_7, y_7) + mul32_to64(x_9, y_5));
            break;
            case 5:
                t = (t >> 26) + mul32_to64(x_0, y_5) + mul32_to64(x_1, y_4) + mul32_to64(x_2, y_3) +
            mul32_to64(x_3, y_2) + mul32_to64(x_4, y_1) + mul32_to64(x_5, y_0) + 19 *
            (mul32_to64(x_6, y_9) + mul32_to64(x_7, y_8) + mul32_to64(x_8, y_7) +
             mul32_to64(x_9, y_6));
            break;
            case 6: 
                t = (t >> 25) + mul32_to64(x_0, y_6) + mul32_to64(x_2, y_4) + mul32_to64(x_4, y_2) +
            mul32_to64(x_6, y_0) + 19 * mul32_to64(x_8, y_8) + 2 * (mul32_to64(x_1, y_5) +
                            mul32_to64(x_3, y_3) + mul32_to64(x_5, y_1)) + 38 *
            (mul32_to64(x_7, y_9) + mul32_to64(x_9, y_7));
            break;
            case 7: t = (t >> 26) + mul32_to64(x_0, y_7) + mul32_to64(x_1, y_6) + mul32_to64(x_2, y_5) +
            mul32_to64(x_3, y_4) + mul32_to64(x_4, y_3) + mul32_to64(x_5, y_2) +
            mul32_to64(x_6, y_1) + mul32_to64(x_7, y_0) + 19 * (mul32_to64(x_8, y_9) +
                            mul32_to64(x_9, y_8));
            break;
            case 8: t = (t >> 25) + dest[8];
            break;
            case 9: dest[i] += (t >> 26);
            break;
        }
        if (i < 9){
            if (i % 2 == 0){
                dest[i] = (t & ((1 << 26) - 1));
            } else {
                dest[i] = (t & ((1 << 25) - 1));
            }
        }
    }    
}
/**
 * 
 * @param {Array} y
 * @param {Array} x
 * @returns {undefined}
 */
function sqr(y, x)
{
    
    var x_0=x[0],x_1=x[1],x_2=x[2],x_3=x[3],x_4=x[4],
             x_5=x[5],x_6=x[6],x_7=x[7],x_8=x[8],x_9=x[9];
    var t;
    
    t = mul32_to64(x_4, x_4) + 2 * (mul32_to64(x_0, x_8) + mul32_to64(x_2, x_6)) + 38 *
            mul32_to64(x_9, x_9) + 4 * (mul32_to64(x_1, x_7) + mul32_to64(x_3, x_5));
    y[8] = (t & ((1 << 26) - 1));
    t = (t >> 26) + 2 * (mul32_to64(x_0, x_9) + mul32_to64(x_1, x_8) + mul32_to64(x_2, x_7) +
                    mul32_to64(x_3, x_6) + mul32_to64(x_4, x_5));
    y[9] = (t & ((1 << 25) - 1));
    t = 19 * (t >> 25) + mul32_to64(x_0, x_0) + 38 * (mul32_to64(x_2, x_8) +
                    mul32_to64(x_4, x_6) + mul32_to64(x_5, x_5)) + 76 * (mul32_to64(x_1, x_9)
                    + mul32_to64(x_3, x_7));
    y[0] = (t & ((1 << 26) - 1));
    t = (t >> 26) + 2 * mul32_to64(x_0, x_1) + 38 * (mul32_to64(x_2, x_9) +
                    mul32_to64(x_3, x_8) + mul32_to64(x_4, x_7) + mul32_to64(x_5, x_6));
    y[1] = (t & ((1 << 25) - 1));
    t = (t >> 25) + 19 * mul32_to64(x_6, x_6) + 2 * (mul32_to64(x_0, x_2) +
                    mul32_to64(x_1, x_1)) + 38 * mul32_to64(x_4, x_8) + 76 *
                    (mul32_to64(x_3, x_9) + mul32_to64(x_5, x_7));
    y[2] = (t & ((1 << 26) - 1));
    t = (t >> 26) + 2 * (mul32_to64(x_0, x_3) + mul32_to64(x_1, x_2)) + 38 *
            (mul32_to64(x_4, x_9) + mul32_to64(x_5, x_8) + mul32_to64(x_6, x_7));
    y[3] = (t & ((1 << 25) - 1));
    t = (t >> 25) + mul32_to64(x_2, x_2) + 2 * mul32_to64(x_0, x_4) + 38 *
            (mul32_to64(x_6, x_8) + mul32_to64(x_7, x_7)) + 4 * mul32_to64(x_1, x_3) + 76 *
            mul32_to64(x_5, x_9);
    y[4] = (t & ((1 << 26) - 1));
    t = (t >> 26) + 2 * (mul32_to64(x_0, x_5) + mul32_to64(x_1, x_4) + mul32_to64(x_2, x_3))
            + 38 * (mul32_to64(x_6, x_9) + mul32_to64(x_7, x_8));
    y[5] = (t & ((1 << 25) - 1));
    t = (t >> 25) + 19 * mul32_to64(x_8, x_8) + 2 * (mul32_to64(x_0, x_6) +
                    mul32_to64(x_2, x_4) + mul32_to64(x_3, x_3)) + 4 * mul32_to64(x_1, x_5) +
                    76 * mul32_to64(x_7, x_9);
    y[6] = (t & ((1 << 26) - 1));
    t = (t >> 26) + 2 * (mul32_to64(x_0, x_7) + mul32_to64(x_1, x_6) + mul32_to64(x_2, x_5) +
                    mul32_to64(x_3, x_4)) + 38 * mul32_to64(x_8, x_9);
    y[7] = (t & ((1 << 25) - 1));
    t = (t >> 25) + y[8];
    y[8] = (t & ((1 << 26) - 1));
    y[9] += t >> 26;
}

/**
 * 
 * @param {Array} q
 * @param {Array} r
 * @param {int} n
 * @param {Array} d
 * @param {int} t
 * @returns {undefined}
 */
function  divmod(q, r,n, d,t)
{
    var rn = 0;
    var dt = ((d[t-1] & 0xFF) << 8);
    if (t > 1)
    {
        dt |= (d[t-2] & 0xFF);
    }
    while (n-- >= t)
    {
        var z = (rn << 16) | ((r[n] & 0xFF) << 8);
        if (n > 0)
        {
                z |= (r[n-1] & 0xFF);
        }
        z/=dt;
        rn += mula_small(r,r, n - t + 1, d, t, -z);
        q[n - t + 1] = ((z + rn) & 0xFF); /* rn is 0 or -1 (underflow) */
        mula_small(r,r, n-t+1, d, t, -rn);
        rn = (r[n] & 0xFF);
        r[n] = 0;
    }
    r[t - 1] = rn;
}

/**
 * 
 * @param {Array} x
 * @param {int} n
 * @returns {Number}
 */
function numsize(x,n)
{
    while (n--!==0 && x[n]==0)
        ;
    return n+1;
}


/**
 * 
 * @param {Array} x
 * @param {Array} u
 * @returns {undefined}
 */
function sqrt(x, u)
{
        var v = new Array(10);
        var t1 = new Array(10);
        var t2 = new Array(10);

    add(t1, u, u);      /* t1 = 2u              */
    recip(v, t1, 1);    /* v = (2u)^((p-5)/8)   */
    sqr(x, v);          /* x = v^2              */
    mul(t2, t1, x);     /* t2 = 2uv^2           */
    --t2[0];            /* t2 = 2uv^2-1         */
    mul(t1, v, t2);     /* t1 = v(2uv^2-1)      */
    mul(x, u, t1);      /* x = uv(2uv^2-1)      */
}
/**
 * 
 * @param {Array} y
 * @param {Array} x
 * @param {int} sqrtassist
 * @returns {undefined}
 */
function recip(y, x, sqrtassist)
{
        var t0 = new Array(10);
        var t1 = new Array(10);
        var t2 = new Array(10);
        var t3 = new Array(10);
        var t4 = new Array(10);
               
    /* the chain for x^(2^255-21) is straight from djb's implementation */
    sqr(t1, x); /*  2 == 2 * 1  */
    sqr(t2, t1);        /*  4 == 2 * 2  */
    sqr(t0, t2);        /*  8 == 2 * 4  */
    mul(t2, t0, x);     /*  9 == 8 + 1  */
    mul(t0, t2, t1);    /* 11 == 9 + 2  */
    sqr(t1, t0);        /* 22 == 2 * 11 */
    mul(t3, t1, t2);    /* 31 == 22 + 9
                            == 2^5   - 2^0      */
    sqr(t1, t3);        /* 2^6   - 2^1  */
    sqr(t2, t1);        /* 2^7   - 2^2  */
    sqr(t1, t2);        /* 2^8   - 2^3  */
    sqr(t2, t1);        /* 2^9   - 2^4  */
    sqr(t1, t2);        /* 2^10  - 2^5  */
    mul(t2, t1, t3);    /* 2^10  - 2^0  */
    sqr(t1, t2);        /* 2^11  - 2^1  */
    sqr(t3, t1);        /* 2^12  - 2^2  */
    for (var i = 1; i < 5; i++)
    {
            sqr(t1, t3);
            sqr(t3, t1);
    } /* t3 */          /* 2^20  - 2^10 */
    mul(t1, t3, t2);    /* 2^20  - 2^0  */
    sqr(t3, t1);        /* 2^21  - 2^1  */
    sqr(t4, t3);        /* 2^22  - 2^2  */
    for (var i = 1; i < 10; i++)
    {
            sqr(t3, t4);
            sqr(t4, t3);
    } /* t4 */          /* 2^40  - 2^20 */
    mul(t3, t4, t1);    /* 2^40  - 2^0  */
    for (var i = 0; i < 5; i++) {
            sqr(t1, t3);
            sqr(t3, t1);
    } /* t3 */          /* 2^50  - 2^10 */
    mul(t1, t3, t2);    /* 2^50  - 2^0  */
    sqr(t2, t1);        /* 2^51  - 2^1  */
    sqr(t3, t2);        /* 2^52  - 2^2  */
    for (var i = 1; i < 25; i++)
    {
            sqr(t2, t3);
            sqr(t3, t2);
    } /* t3 */          /* 2^100 - 2^50 */
    mul(t2, t3, t1);    /* 2^100 - 2^0  */
    sqr(t3, t2);        /* 2^101 - 2^1  */
    sqr(t4, t3);        /* 2^102 - 2^2  */
    for (var i = 1; i < 50; i++)
    {
            sqr(t3, t4);
            sqr(t4, t3);
    } /* t4 */          /* 2^200 - 2^100 */
    mul(t3, t4, t2);    /* 2^200 - 2^0  */
    for (var i = 0; i < 25; i++)
    {
            sqr(t4, t3);
            sqr(t3, t4);
    } /* t3 */          /* 2^250 - 2^50 */
    mul(t2, t3, t1);    /* 2^250 - 2^0  */
    sqr(t1, t2);        /* 2^251 - 2^1  */
    sqr(t2, t1);        /* 2^252 - 2^2  */
    if (sqrtassist!=0)
    {
            mul(y, x, t2);      /* 2^252 - 3 */
    }
    else
    {
            sqr(t1, t2);        /* 2^253 - 2^3  */
            sqr(t2, t1);        /* 2^254 - 2^4  */
            sqr(t1, t2);        /* 2^255 - 2^5  */
            mul(y, t1, t0);     /* 2^255 - 21   */
    }
}

/**
 * 
 * @param {Array} x
 * @param {Array} y
 * @param {Array} a
 * @param {Array} b
 * @returns {Number}
 */
function egcd32(x,  y,  a, b)
{
    var an, bn = 32, qn, i;
    for (i = 0; i < 32; i++)
        x[i] = y[i] = 0;
    x[0] = 1;
    an = numsize(a, 32);
    if (an==0)
        return y;       /* division by zero */
    var temp = new Array(32);
    while (true)
    {
        qn = bn - an + 1;
        divmod(temp, b, bn, a, an);
        bn = numsize(b, bn);
        if (bn==0)
                return x;
        mula32(y, x, temp, qn, -1);

        qn = an - bn + 1;
        divmod(temp, a, an, b, bn);
        an = numsize(a, an);
        if (an==0)
                return y;
        mula32(x, y, temp, qn, -1);
    }
}

/**
 * 
 * @param {Array} p
 * @param {Array} x
 * @param {Array} y
 * @param {int} t
 * @param {int} z
 * @returns {Number}
 */
function mula32( p,  x,  y,  t,  z)
{
    var n = 31;
    var w = 0;
    var i = 0;
    for (; i < t; i++) {
        var zy = z * (y[i] & 0xFF);
        w += mula_small(p, p, i, x, n, zy) +
	        (p[i+n] & 0xFF) + zy * (x[n] & 0xFF);
        p[i+n] = w;
        w >>= 8;
    }
    p[i+n] = (w + (p[i+n] & 0xFF));
    return w >> 8;
}

/**
 * 
 * @param {Array} t1
 * @param {Array} t2
 * @param {Array} t3
 * @param {Array} t4
 * @param {Array} ax
 * @param {Array} az
 * @param {Array} dx
 * @returns {undefined}
 */
function mont_add( t1,  t2,  t3,  t4,  ax,  az,  dx)
{
    mul(ax, t2, t3);
    mul(az, t1, t4);
    add(t1, ax, az);
    sub(t2, ax, az);
    sqr(ax, t1);
    sqr(t1, t2);
    mul(az, t1, dx);
}

/**
 * 
 * @param {Array} t1
 * @param {Array} t2
 * @param {Array} t3
 * @param {Array} t4
 * @param {Array} bx
 * @param {Array} bz
 * @returns {undefined}
 */
function mont_dbl( t1,  t2,  t3,  t4, bx,  bz)
{
    sqr(t1, t3);
    sqr(t2, t4);
    mul(bx, t1, t2);
    sub(t2, t1, t2);
    mul_small(bz, t2, 121665);
    add(t1, t1, bz);
    mul(bz, t1, t2);
}

/**
 * 
 * @param {Array} t
 * @param {Array} y2
 * @param {Array} x
 * @returns {undefined}
 */
function  x_to_y2( t,  y2,  x)
{
    sqr(t, x);
    mul_small(y2, x, 486662);
    add(t, t, y2);
    ++t[0];
    mul(y2, t, x);
}
/**
 * 
 * @param {int} v
 * @param {int} h
 * @param {int} x
 * @param {int} s
 * @returns {Boolean}
 */

function sign(v, h, x, s)
{
    /* v = (x - h) s  mod q  */
    var tmp1 = Array(65);
    var tmp2 = Array(33);
    var w;
    var i;
    for (i = 0; i < 32; i++)
            v[i] = 0;
    i = mula_small(v, x, 0, h, 32, -1);
    mula_small(v, v, 0, ORDER, 32, (15-v[31])/16);
    mula32(tmp1, v, s, 32, 1);
    divmod(tmp2, tmp1, 64, ORDER, 32);
    for (w = 0, i = 0; i < 32; i++)
            w |= v[i] = tmp1[i];
    return w != 0;
}
/**
 * 
 * @param {Array} k
 * @returns {undefined}
 */
function clamp(k)
{
    k[31] &= 0x7F;
    k[31] |= 0x40;
    k[ 0] &= 0xF8;
}

/**
 * 
 * @param {Array} Px
 * @param {Array} s
 * @param {Array} k
 * @param {Array} Gx
 * @returns {undefined}
 */
function core( Px,  s,  k,  Gx)
{
        var dx = new Array(10), t1 = new Array(10), t2 = new Array(10), t3 = new Array(10), t4 = new Array(10);
    
    var x = new Array(3), z = new Array(3);
    
    /* unpack the base */
    if (Gx)
            unpack(dx, Gx);
    else
            set(dx, 9);

    /* 0G = povar-at-infinity */
    set(x, 1);
    set(z, 0);

    /* 1G = G */
    x[1] = dx;
    set(z[1], 1);

    for (var i = 32; i-- > 0; )
    {
            for (var j = 8; j--> 0; )
            {
                    /* swap arguments depending on bit */
                    var bit1 = ((k[i] & 0xFF) >> j) & 1;
                    var bit0 = (~(k[i] & 0xFF) >> j) & 1;
                    var ax = x[bit0];
                    var az = z[bit0];
                    var bx = x[bit1];
                    var bz = z[bit1];

                    /* a' = a + b       */
                    /* b' = 2 b */
                    mont_prep(t1, t2, ax, az);
                    mont_prep(t3, t4, bx, bz);
                    mont_add(t1, t2, t3, t4, ax, az, dx);
                    mont_dbl(t1, t2, t3, t4, bx, bz);
            }
    }

    recip(t1, z[0], 0);
    mul(dx, x[0], t1);
    pack(dx, Px);

    /* calculate s such that s abs(P) = G  .. assumes G is std base povar */
    if (s)
    {
            x_to_y2(t2, t1, dx);        /* t1 = Py^2  */
            recip(t3, z[1], 0); /* where Q=P+G ... */
            mul(t2, x[1], t3);  /* t2 = Qx  */
            add(t2, t2, dx);    /* t2 = Qx + Px  */
            t2[0] += 9 + 486662;        /* t2 = Qx + Px + Gx + 486662  */
            dx[0] -= 9;         /* dx = Px - Gx  */
            sqr(t3, dx);        /* t3 = (Px - Gx)^2  */
            mul(dx, t2, t3);    /* dx = t2 (Px - Gx)^2  */
            sub(dx, dx, t1);    /* dx = t2 (Px - Gx)^2 - Py^2  */
            dx[0] -= 39420360;  /* dx = t2 (Px - Gx)^2 - Py^2 - Gy^2  */
            mul(t1, dx, BASE_R2Y);      /* t1 = -Py  */
            if (is_negative(t1)!=0)     /* sign is 1, so just copy  */
                    cpy32(s, k);
            else                        /* sign is -1, so negate  */
                    mula_small(s, ORDER_TIMES_8, 0, k, 32, -1);

            /* reduce s mod q
             * (is this needed?  do it just in case, it's fast anyway) */
            //divmod((dstptr) t1, s, 32, order25519, 32);

            /* take reciprocal of s mod q */
            var temp1=new Array(32);
            var temp2=new Array(64);
            var temp3=new Array(64);
            cpy32(temp1, ORDER);
            cpy32(s, egcd32(temp2, temp3, s, temp1));
            if ((s[31] & 0x80)!=0)
                    mula_small(s, s, 0, ORDER, 32, 1);
    }
}
/**
 * 
 * @param {Array} P
 * @param {Array} s
 * @param {Array} k
 * @returns {undefined}
 */
module.exports.keygen = function keygen(P, s, k)
{
    clamp(k);
    core(P, s, k, null);
}

/**
 * 
 * @param {Array} Z
 * @param {Array} k
 * @param {Array} P
 * @returns {undefined}
 */
function curve(Z, k, P)
{
    core(Z, 0, k, P);
}

/**
 * 
 * @param {Array} Y
 * @param {Array} v
 * @param {Array} h
 * @param {Array} P
 * @returns {undefined}
 */
function verify(Y, v, h, P)
{
    /* Y = v abs(P) + h G  */
    var d = new Array(32);
    
    var p = new Array(2), s = new Array(2), yx = new Array(3), yz = new Array(3), t1 = new Array(3), t2 = new Array(3);
        
    var vi = 0, hi = 0, di = 0, nvh=0, i, j, k;

    /* set p[0] to G and p[1] to P  */

    set(p, 9);
    unpack(p[1], P);

    /* set s[0] to P+G and s[1] to P-G  */

    /* s[0] = (Py^2 + Gy^2 - 2 Py Gy)/(Px - Gx)^2 - Px - Gx - 486662  */
    /* s[1] = (Py^2 + Gy^2 + 2 Py Gy)/(Px - Gx)^2 - Px - Gx - 486662  */

    x_to_y2(t1, t2, p);        /* t2[0] = Py^2  */
    sqrt(t1[0], t2[0]); /* t1[0] = Py or -Py  */
    j = is_negative(t1[0]);             /*      ... check which  */
    t2[0][0] += 39420360;               /* t2[0] = Py^2 + Gy^2  */
    mul(t2[1], BASE_2Y, t1[0]);/* t2[1] = 2 Py Gy or -2 Py Gy  */
    sub(t1[j], t2[0], t2[1]);   /* t1[0] = Py^2 + Gy^2 - 2 Py Gy  */
    add(t1[1-j], t2[0], t2[1]);/* t1[1] = Py^2 + Gy^2 + 2 Py Gy  */
    t2[0] = p[1];               /* t2[0] = Px  */
    t2[0][0] -= 9;                      /* t2[0] = Px - Gx  */
    sqr(t2[1], t2[0]);          /* t2[1] = (Px - Gx)^2  */
    recip(t2[0], t2[1], 0);     /* t2[0] = 1/(Px - Gx)^2  */
    mul(s, t1, t2);    /* s[0] = t1[0]/(Px - Gx)^2  */
    sub(s[0], s[0], p[1]);      /* s[0] = t1[0]/(Px - Gx)^2 - Px  */
    s[0][0] -= 9 + 486662;              /* s[0] = X(P+G)  */
    mul(s[1], t1[1], t2[0]);    /* s[1] = t1[1]/(Px - Gx)^2  */
    sub(s[1], s[1], p[1]);      /* s[1] = t1[1]/(Px - Gx)^2 - Px  */
    s[1][0] -= 9 + 486662;              /* s[1] = X(P-G)  */
    mul_small(s[0], s[0], 1);   /* reduce s[0] */
    mul_small(s[1], s[1], 1);   /* reduce s[1] */


    /* prepare the chain  */
    for (i = 0; i < 32; i++)
    {
            vi = (vi >> 8) ^ (v[i] & 0xFF) ^ ((v[i] & 0xFF) << 1);
            hi = (hi >> 8) ^ (h[i] & 0xFF) ^ ((h[i] & 0xFF) << 1);
            nvh = ~(vi ^ hi);
            di = (nvh & (di & 0x80) >> 7) ^ vi;
            di ^= nvh & (di & 0x01) << 1;
            di ^= nvh & (di & 0x02) << 1;
            di ^= nvh & (di & 0x04) << 1;
            di ^= nvh & (di & 0x08) << 1;
            di ^= nvh & (di & 0x10) << 1;
            di ^= nvh & (di & 0x20) << 1;
            di ^= nvh & (di & 0x40) << 1;
            d[i] = di;
    }

    di = ((nvh & (di & 0x80) << 1) ^ vi) >> 8;

    /* initialize state */
    set(yx, 1);
    yx[1] = p[di];
    yx[2] = s[0];
    set(yz, 0);
    set(yz, 1);
    set(yz, 1);

    /* y[0] is (even)P + (even)G
     * y[1] is (even)P + (odd)G  if current d-bit is 0
     * y[1] is (odd)P + (even)G  if current d-bit is 1
     * y[2] is (odd)P + (odd)G
     */

    vi = 0;
    hi = 0;

    /* and go for it! */
    for (i = 32; i-- > 0; )
    {
            vi = (vi << 8) | (v[i] & 0xFF);
            hi = (hi << 8) | (h[i] & 0xFF);
            di = (di << 8) | (d[i] & 0xFF);

            for (j = 8; j-- > 0; )
            {
                    mont_prep(t1[0], t2[0], yx[0], yz[0]);
                    mont_prep(t1[1], t2[1], yx[1], yz[1]);
                    mont_prep(t1[2], t2[2], yx[2], yz[2]);

                    k = ((vi ^ vi >> 1) >> j & 1)
                      + ((hi ^ hi >> 1) >> j & 1);
                    mont_dbl(yx[2], yz[2], t1[k], t2[k], yx[0], yz[0]);

                    k = (di >> j & 2) ^ ((di >> j & 1) << 1);
                    mont_add(t1[1], t2[1], t1[k], t2[k], yx[1], yz[1],
                                    p[di >> j & 1]);

                    mont_add(t1[2], t2[2], t1[0], t2[0], yx[2], yz[2],
                                    s[((vi ^ hi) >> j & 2) >> 1]);
            }
    }

    k = (vi & 1) + (hi & 1);
    recip(t1[0], yz[k], 0);
    mul(t1[1], yx[k], t1[0]);

    pack(t1[1], Y);
}
module.exports.curveMain = curve;
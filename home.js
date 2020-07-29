const express = require('express');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');
const session = require('express-session');
const exp_val = require('express-validator');


const app = express();
const port = process.env.PORT;
//const port = 5000;
const router = express.Router();
app.use(exp_val());

const STRIPE_API = require('./api/stripe-functions.js');

app.set('view engine', 'html');
app.engine('html', nunjucks.render);
nunjucks.configure('views', {noCache: true});

app.use(express.static(__dirname));
app.use(bodyParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', router);

const db = require('./database');

app.use(session({
    secret: 'ema-Planner',
    resave: false,
    saveUninitialized: true,
    cookie: {maxAge: 60 * 60 * 1000}
}));

function convertToMoney(amount){
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    })
    return formatter.format(amount / 100);
}

app.get('/', (req, res) => {
    //if (req.headers['x-forwarded-proto'] != 'https'){
    //    res.redirect('https://ema-planner.herokuapp.com/')
    //} else {
        const stripe = require('stripe')(process.env.STRIPE_API_KEY);
        stripe.balance.retrieve((err, balance) => {
            if (balance){
                res.render('home.html', {
                    balance_available: convertToMoney(balance.available[0].amount),
                    balance_pending: convertToMoney(balance.pending[0].amount),
                    checked_today: '0',
                    checked_week: '0',
                    dragons: '0',
                    basic: '0',
                    lvl1: '0',
                    lvl2: '0',
                    lvl3: '0',
                    bb: '0'
                });
            } else {
                console.log('Balance err: ' + err);
            }
        });
    //}
});

router.get('/home', (req, res) => {
    //if (req.headers['x-forwarded-proto'] != 'https'){
    //    res.redirect('https://ema-planner.herokuapp.com/')
    //} else {
        res.render('home.html', {
            classes_today: '',
            classes_weekly: ''
        });
    //}
});

router.get('/add_student', function(req, res){
    //if (req.headers['x-forwarded-proto'] != 'https'){
    //    res.redirect('https://ema-planner.herokuapp.com/home/add_student')
    //} else {
        res.render('add_student', {
            barcode: '',
            first_name: '',
            last_name: '',
            addr_1: '',
            city: '',
            zip: '',
            email: '',
            phone: '',
            belt_color: '',
            belt_size: ''
        })
    //}
});

router.post('/add_student', function(req, res){
    var item = {
        first_name: req.sanitize('first_name').trim(),
        last_name: req.sanitize('last_name').trim(),
        barcode: req.sanitize('barcode').trim(),
        addr_1: req.sanitize('addr_1').trim(),
        city: req.sanitize('city').trim(),
        zip: req.sanitize('zip').trim(),
        email: req.sanitize('email').trim(),
        phone: req.sanitize('phone').trim(),
        belt_color: req.sanitize('belt_color').trim(),
        belt_size: req.sanitize('belt_size').trim()
    }
    console.log('INFO TESTING: ' + item.zip + ' ' + item.addr_1);
    var query = 'insert into student_list (barcode, first_name, last_name, addr_1, zip_code, city, belt_color, belt_size, email, phone_number) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);';
    db.query(query, [item.barcode, item.first_name, item.last_name, item.addr_1, item.zip, item.city, item.belt_color, item.belt_size, item.email, item.phone])
        .then(function(rows){
            console.log("In .then");
            var redir_link = '/customerView/' + item.first_name + ' ' + item.last_name + '/' + item.email + '/' + item.phone + '/' + item.addr_1 + '/' + item.city + '/' + item.zip + '/' + item.barcode;
            res.redirect(redir_link);
        })
        .catch(function(err){
            res.redirect('/');
            console.log('ERROR is ' + err);
        })
});

router.get('/adminView', function(req, res){
    STRIPE_API.getAllProductsAndPlans().then(products => {
        res.render('adminView.html', {products: products});
    });
});

router.get('/createProduct', (req, res) => {
    res.render('createProduct.html');
});

router.post('/createProduct', (req, res) => {
    STRIPE_API.createProduct(req.body).then(() => {
        res.render('createProduct.html', {success: true});
    });
});

router.post('/createPlan', (req, res) => {
    res.render('createPlan.html', {
        productID: req.body.productID,
        productName: req.body.productName
    });
});

router.post('/createPlanForReal', (req, res) => {
    STRIPE_API.createPlan(req.body).then(() => {
        res.render('createPlan.html', {success: true});
    });
});

router.get('/customerView/(:studentName)/(:studentEmail)/(:studentPhone)/(:studentAddr)/(:studentCity)/(:studentZip)/(:barcode)', (req, res) => {
    STRIPE_API.getAllProductsAndPlans().then(products => {
        products = products.filter(product => {
            return product.plans.length > 0;
        });

        res.render('customerView.html', {
            products: products,
            studentName: req.params.studentName,
            studentEmail: req.params.studentEmail,
            studentPhone: req.params.studentPhone,
            studentAddr: req.params.studentAddr,
            studentCity: req.params.studentCity,
            studentZip: req.params.studentZip,
            barcode: req.params.barcode
        });
    });
});

router.get('/customerView', (req, res) => {
    STRIPE_API.getAllProductsAndPlans().then(products => {
        products = products.filter(product => {
            return product.plans.length > 0;
        });

        res.render('customerView.html', {
            products: products
        });
    });
});

router.post('/signUp', (req, res) => {
    var product = {
        name: req.body.productName
    };

    var plan = {
        Id: req.body.planId,
        name: req.body.planName,
        amount: req.body.planAmount,
        interval: req.body.planInterval,
        interval_count: req.body.planIntervalCount
    }


    res.render('signUp.html', {
        product: product, 
        plan: plan,
        studentEmail: req.body.studentEmail,
        studentName: req.body.studentName,
        studentPhone: req.body.studentPhone,
        studentAddr: req.body.studentAddr,
        studentCity: req.body.studentCity,
        studentZip: req.body.studentZip,
        barcode: req.body.barcode
    });
});

router.post('/processPayment', (req, res) => {
    var product = {
        name: req.body.productName
    };
    
    var plan = {
        Id: req.body.planId,
        name: req.body.planName,
        amount: req.body.planAmount,
        interval: req.body.planInterval,
        interval_count: req.body.planIntervalCount
    }

    STRIPE_API.createCustomerAndSubscription(req.body).then(() => {
        res.render('signUp.html', {
            product: product, 
            plan: plan, 
            success: true,
            studentEmail: req.body.studentEmail,
            studentName: req.body.studentName,
            studentPhone: req.body.studentPhone,
            studentAddr: req.body.studentAddr,
            studentCity: req.body.studentCity,
            studentZip: req.body.studentZip,
            barcode: req.body.barcode
        });
    }).catch(err => {
        res.render('signUp.html', {
            product: product, 
            plan: plan, 
            error: true,
            studentEmail: req.body.studentEmail,
            studentName: req.body.studentName,
            studentPhone: req.body.studentPhone,
            studentAddr: req.body.studentAddr,
            studentCity: req.body.studentCity,
            studentZip: req.body.studentZip,
            barcode: req.body.barcode
        });
    });
});

router.get('/class_selector', (req, res) => {
    var query = "select class_id, to_char(starts_at, 'Month') as class_month, to_char(starts_at, 'DD') as class_day, to_char(starts_at, 'HH:MI') as class_time, to_char(ends_at, 'HH:MI') as end_time, level from classes where date_trunc('day', starts_at) = date_trunc('day', now() - interval '6 hour') order by starts_at;";
    db.any(query)
        .then(function(rows){
            res.render('class_selector', {
                data: rows
            });
        })
        .catch(function(err){
            console.log('error in getting classes ' + err);
            res.redirect('home');
        })
});

router.get('/class_checkin/(:class_id)', (req, res) => {
    var query = "select level, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') as class_date, to_char(starts_at, 'HH:MI') as class_time, class_id from classes where class_id = $1;"
    db.any(query, [req.params.class_id])
        .then(function(rows){
            res.render('class_checkin.html', {
                data: rows
            });
        })
        .catch(function(err){
            res.redirect('home');
            console.log("error finding class with id " + err);
        })
});
//class checkin
    //Select from classes for the day
    //use id to forward to checkin page with place for barcode scan
    //scan and redirect to that same checkin page

app.post('/webhook', (request, response) => {
    let event;
    try {
        console.log('event is ' + event);
    } catch (err) {
        response.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (request.body.type) {
        case 'customer.deleted':
            const studentCode = request.body.data.object.metadata.barcode;
            var query = 'delete from student_list where barcode = $1;';
            db.none(query, [studentCode]);
            break;
        //case 'payment_method.attached':
        
        
        //break;
        // ... handle other event types
        default:
        // Unexpected event type
        return response.status(400).end();
    }

    // Return a response to acknowledge receipt of the event
    response.json({received: true});
    });

app.listen(port, () => {
    console.info('EMA-Planner running on port', port);
});
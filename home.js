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

router.get('/class_remove/(:barcode)/(:class_id)', (req, res) => {
    const remove_query = 'delete from student_classes where class_id = $1 and barcode = $2;';
    db.any(remove_query, [req.params.class_id, req.params.barcode])
        .then(function(rows){
            var query = "select s.first_name || ' ' || s.last_name as student_name, b.session_id, s.barcode from student_list s, student_classes b where s.barcode in (select barcode from student_classes) and b.class_id = $1"
            db.any(query, [req.params.class_id])
                .then(function(rows){
                    res.render('class_checkin.html', {
                        data: rows,
                        level: req.params.class_level,
                        time: req.params.class_time,
                        class_id: req.params.class_id
                    });
                })
                .catch(function(err){
                    res.redirect('home');
                    console.log("error finding class with id " + err);
                })
        })
        .catch(function(err){
            console.log('Could not remove person from class with class_id and barcode ' + req.params.class_id + ', ' + req.params.barcode + '. Err: ' + err);
            res.redirect('class_selector');
        })
});

router.get('/class_checkin/(:class_id)/(:class_level)/(:class_time)', (req, res) => {
    var query = "select s.first_name || ' ' || s.last_name as student_name, b.session_id, b.barcode from student_list s, student_classes b where s.barcode in (select barcode from student_classes) and b.class_id = $1"
    db.any(query, [req.params.class_id])
        .then(function(rows){
            res.render('class_checkin.html', {
                data: rows,
                level: req.params.class_level,
                time: req.params.class_time,
                class_id: req.params.class_id
            });
        })
        .catch(function(err){
            res.redirect('home');
            console.log("error finding class with id " + err);
        })
});

router.post('/class_checkin', (req, res) => {
    var item = {
        class_id: req.sanitize('class_id').trim(),
        barcode_input: req.sanitize('barcode_input').trim(),
        level: req.sanitize('level').trim(),
        time: req.sanitize('time').trim()
    }
    var query = 'insert into student_classes (class_id, barcode) values ($1, $2);';
    db.any(query, [item.class_id, item.barcode_input])
        .then(function(rows1){
            var query = "select s.first_name || ' ' || s.last_name as student_name, b.session_id from student_list s, student_classes b where s.barcode in (select barcode from student_classes) and b.class_id = $1"
            db.any(query, [item.class_id])
                .then(function(rows){
                    res.render('class_checkin.html', {
                        data: rows,
                        level: item.level,
                        time: item.time,
                        class_id: item.class_id
                    });
                })
                .catch(function(err){
                    res.redirect('home');
                    console.log("error finding class with id " + err);
                })
        })
        .catch(function(err){
            res.redirect('home');
            console.log("Unable to checkin to class " + err);
        })
});

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
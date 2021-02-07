const express = require('express')
const bodyParser = require('body-parser')
const nunjucks = require('nunjucks')
const session = require('express-session')
const exp_val = require('express-validator')
var flash = require('connect-flash')

const app = express()
app.use(flash());
app.use(session({ cookie: { maxAge: 60000 }, 
  secret: 'secret_key',
  resave: false, 
  saveUninitialized: false}));
const port = process.env.PORT
// const port = 5000;
const router = express.Router()
app.use(exp_val())

const STRIPE_API = require('./api/stripe-functions.js')

app.set('view engine', 'html')
app.engine('html', nunjucks.render)
nunjucks.configure('views', { noCache: true })

app.use(express.static(__dirname))
app.use(bodyParser())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use('/', router)


const db = require('./database')

app.use(session({
  secret: 'ema-Planner',
  resave: true,
  saveUninitialized: true,
  useCookieSession: true,
  cookie: { maxAge: 60 * 60 * 1000 }
}))

app.use(flash({ sessionKeyName: 'ema-Planner' }))

function convertToMoney (amount) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  })
  return formatter.format(amount / 100)
}

app.get('/', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/')
  } else {
    const student_query = 'select level_name, count(level_name) from student_list group by level_name, belt_order order by belt_order;'
    db.any(student_query)
      .then(function (rows) {
        const stripe = require('stripe')(process.env.STRIPE_API_KEY)
        stripe.balance.retrieve((err, balance) => {
          if (balance) {
            const failure_query = 'select count(id_failed) as failed_num from failed_payments'
            db.one(failure_query)
              .then(function (row) {
                res.render('home.html', {
                  balance_available: convertToMoney(balance.available[0].amount),
                  balance_pending: convertToMoney(balance.pending[0].amount),
                  checked_today: '0',
                  checked_week: '0',
                  student_data: rows,
                  failure_num: row
                })
              })
              .catch(function (err) {
                console.log('Could not get failed_payment count ' + err)
                res.render('home.html')
              })
          } else {
            console.log('Balance err: ' + err)
          }
        })
          .catch(function (err) {
            console.log('Could not run query to count students: ' + err)
          })
      })
  }
})

router.get('/home', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/')
  } else {
    res.redirect('/')
  }
})

router.get('/add_student', function (req, res) {
  // if (req.headers['x-forwarded-proto'] != 'https'){
  //    res.redirect('https://ema-planner.herokuapp.com/home/add_student')
  // } else {
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
  // }
})

router.post('/add_student', function (req, res) {
  const item = {
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
  let level_id = 0
  let belt_num = 0
  switch (item.belt_color) {
    case ('Dragons White'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Gold'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Orange'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Green'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Purple'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Blue'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Red'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Brown'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('White'):
      level_id = 'Basic'
      belt_num = 0
      break
    case ('Gold'):
      level_id = 'Basic'
      belt_num = 0
      break
    case ('Orange'):
      level_id = 'Level 1'
      belt_num = 1
      break
    case ('High Orange'):
      level_id = 'Level 1'
      belt_num = 1
      break
    case ('Green'):
      level_id = 'Level 1'
      belt_num = 1
      break
    case ('High Green'):
      level_id = 'Level 1'
      belt_num = 1
      break
    case ('Purple'):
      level_id = 'Level 2'
      belt_num = 2
      break
    case ('High Purple'):
      level_id = 'Level 2'
      belt_num = 2
      break
    case ('Blue'):
      level_id = 'Level 2'
      belt_num = 2
      break
    case ('High Blue'):
      level_id = 'Level 2'
      belt_num = 2
      break
    case ('Red'):
      level_id = 'Level 3'
      belt_num = 3
      break
    case ('High Red'):
      level_id = 'Level 3'
      belt_num = 3
      break
    case ('Brown'):
      level_id = 'Level 3'
      belt_num = 3
      break
    case ('High Brown'):
      level_id = 'Level 2'
      belt_num = 3
      break
    case ('Black Belt'):
      level_id = 'Black Belt'
      belt_num = 5
      break
    default:
      level_id = 'Unknown'
      belt_num = 999
      break
  };
  const query = 'insert into student_list (barcode, first_name, last_name, addr_1, zip_code, city, belt_color, belt_size, email, phone_number, level_name, belt_order) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);'
  db.query(query, [item.barcode, item.first_name, item.last_name, item.addr_1, item.zip, item.city, item.belt_color, item.belt_size, item.email, item.phone, level_id, belt_num])
    .then(function (rows) {
      console.log('In .then')
      const redir_link = '/customerView/' + item.first_name + ' ' + item.last_name + '/' + item.email + '/' + item.phone + '/' + item.addr_1 + '/' + item.city + '/' + item.zip + '/' + item.barcode
      res.redirect(redir_link)
    })
    .catch(function (err) {
      res.redirect('/')
      console.log('ERROR is ' + err)
    })
})

router.get('/adminView', function (req, res) {
  STRIPE_API.getAllProductsAndPlans().then(products => {
    res.render('adminView.html', { products: products })
  })
})

router.get('/createProduct', (req, res) => {
  res.render('createProduct.html')
})

router.post('/createProduct', (req, res) => {
  STRIPE_API.createProduct(req.body).then(() => {
    res.render('createProduct.html', { success: true })
  })
})

router.post('/createPlan', (req, res) => {
  res.render('createPlan.html', {
    productID: req.body.productID,
    productName: req.body.productName
  })
})

router.post('/createPlanForReal', (req, res) => {
  STRIPE_API.createPlan(req.body).then(() => {
    res.render('createPlan.html', { success: true })
  })
})

router.get('/customerView/(:studentName)/(:studentEmail)/(:studentPhone)/(:studentAddr)/(:studentCity)/(:studentZip)/(:barcode)', (req, res) => {
  STRIPE_API.getAllProductsAndPlans().then(products => {
    products = products.filter(product => {
      return product.plans.length > 0
    })

    res.render('customerView.html', {
      products: products,
      studentName: req.params.studentName,
      studentEmail: req.params.studentEmail,
      studentPhone: req.params.studentPhone,
      studentAddr: req.params.studentAddr,
      studentCity: req.params.studentCity,
      studentZip: req.params.studentZip,
      barcode: req.params.barcode
    })
  })
})

router.get('/customerView', (req, res) => {
  STRIPE_API.getAllProductsAndPlans().then(products => {
    products = products.filter(product => {
      return product.plans.length > 0
    })

    res.render('customerView.html', {
      products: products
    })
  })
})

router.post('/signUp', (req, res) => {
  const product = {
    name: req.body.productName
  }

  const plan = {
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
  })
})

router.post('/processPayment', (req, res) => {
  const product = {
    name: req.body.productName
  }

  const plan = {
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
    })
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
    })
  })
})

router.get('/class_selector', (req, res) => {
  const query = "select class_id, to_char(starts_at, 'Month') as class_month, to_char(starts_at, 'DD') as class_day, to_char(starts_at, 'HH:MI') as class_time, to_char(ends_at, 'HH:MI') as end_time, level from classes where date_trunc('day', starts_at) = date_trunc('day', now() - interval '6 hour') order by starts_at;"
  db.any(query)
    .then(function (rows) {
      res.render('class_selector', {
        data: rows
      })
    })
    .catch(function (err) {
      console.log('error in getting classes ' + err)
      res.redirect('home')
    })
})

router.get('/class_selector_force/(:month)/(:day)', (req, res) => {
  const date_conversion = req.params.month + ' ' + req.params.day
  const query = "select class_id, to_char(starts_at, 'Month') as class_month, to_char(starts_at, 'DD') as class_day, to_char(starts_at, 'HH:MI') as class_time, to_char(ends_at, 'HH:MI') as end_time, level from classes where to_char(starts_at, 'Month DD') = to_char(to_date($1, 'Month DD'), 'Month DD') order by starts_at;"
  db.any(query, [date_conversion])
    .then(function (rows) {
      res.render('class_selector', {
        data: rows
      })
    })
    .catch(function (err) {
      console.log('error in getting classes ' + err)
      res.redirect('home')
    })
})

router.get('/class_remove/(:barcode)/(:class_id)', (req, res) => {
  const remove_query = 'delete from student_classes where class_id = $1 and barcode = $2;'
  db.any(remove_query, [req.params.class_id, req.params.barcode])
    .then(function (rows) {
      res.redirect('https://ema-planner.herokuapp.com/class_selector')
    })
    .catch(function (err) {
      console.log('Could not remove person from class with class_id and barcode ' + req.params.class_id + ', ' + req.params.barcode + '. Err: ' + err)
      res.redirect('https://ema-planner.herokuapp.com/class_selector')
    })
})

router.get('/class_checkin/(:class_id)/(:class_level)/(:class_time)', (req, res) => { // query needs to look for barcode not in student_list, but in class_list
  const query = "select distinct s.first_name || ' ' || s.last_name as student_name, s.barcode from student_list s, student_classes b where b.class_id = $1 and s.barcode in (select barcode from student_classes where class_id = $2)"
  db.any(query, [req.params.class_id, req.params.class_id])
    .then(function (rows) {
      res.render('class_checkin.html', {
        data: rows,
        level: req.params.class_level,
        time: req.params.class_time,
        class_id: req.params.class_id
      })
    })
    .catch(function (err) {
      res.redirect('home')
      console.log('error finding class with id ' + err)
    })
})

router.post('/class_checkin', (req, res) => {
  const item = {
    class_id: req.sanitize('class_id').trim(),
    barcode_input: req.sanitize('barcode_input').trim(),
    level: req.sanitize('level').trim(),
    time: req.sanitize('time').trim()
  }
  const query = 'insert into student_classes (class_id, barcode) values ($1, $2) on conflict (session_id) do nothing;'
  db.any(query, [item.class_id, item.barcode_input])
    .then(function (rows1) {
      res.redirect('class_checkin/' + item.class_id + '/' + item.level + '/' + item.time)
    })
    .catch(function (err) {
      res.redirect('home')
      console.log('Unable to checkin to class ' + err)
    })
})

router.get('/failed_charges', (req, res) => {
  const query = 'select * from failed_payments'
  db.any(query)
    .then(function (rows) {
      res.render('failed_charges', {
        failed_payments: rows
      })
    })
    .catch(function (err) {
      console.log('Could not retrieve failed payments ' + err)
      res.render('failed_charges', {
        failed_payments: ''
      })
    })
})

router.get('/email_payment_failure/(:email)/(:amount)/(:reason)/(:customer)', (req, res) => {
  // Add email client to notify of failure.
  res.redirect('failed_charges')
})

router.get('/payment_resolved/(:id)', (req, res) => {
  const resolve_query = 'delete from failed_payments where id_failed = $1'
  db.none(resolve_query, [req.params.id])
    .then(function (row) {
      console.log('Payment was resolved.')
      const query = 'select * from failed_payments'
      db.any(query)
        .then(function (rows) {
          res.render('failed_charges', {
            failed_payments: rows
          })
        })
        .catch(function (err) {
          console.log('Could not retrieve failed payments ' + err)
          res.render('failed_charges', {
            failed_payments: ''
          })
        })
    })
    .catch(function (err) {
      console.log('Error resolving payment with id ' + req.params.id)
      res.redirect('/')
    })
})

router.get('/class_lookup', (req, res) => {
  res.render('class_lookup', {

  })
})

router.post('/class_lookup', (req, res) => {
  const item = {
    month: req.sanitize('month_select').trim(),
    day: req.sanitize('day_select').trim()
  }
  const redir_link = 'class_selector_force/' + item.month + '/' + item.day
  res.redirect(redir_link)
})

router.get('/student_lookup', (req, res) => {
  const name_query = "select first_name || ' ' || last_name as names from student_list"
  db.any(name_query)
    .then(function (rows) {
      res.render('student_lookup', {
        data: rows
      })
    })
    .catch(function (err) {
      console.log('Could not find students: ' + err)
      res.redirect('/')
    })
})

router.get('/create_test', (req, res) => {
  res.render('create_test', {
  })
})

router.post('/create_test', (req, res) => {
  const item = {
    level: req.sanitize('level_select').trim(),
    month: req.sanitize('month_select').trim(),
    day: req.sanitize('day_select').trim(),
    time: req.sanitize('time_select').trim()
  }
  let temp_date = new Date();
  let year = temp_date.getFullYear();
  const built_date = item.month + ' ' + item.day + ', ' + year;
  console.log('item.level: ' + item.level);
  console.log('built_date: ' + built_date);
  console.log('item.time: ' + item.time);
  const new_test_query = "insert into test_instance (level, test_date, test_time) values (($1)::int, to_date($2, 'Month DD, YYYY'), ($3)::time)";
  db.any(new_test_query, [item.level, built_date, item.time])
    .then(function(rows){
      switch (item.level) {
        case '-1':
          req.flash('success', 'Test created for Little Dragons on ' + built_date + ' at ' + item.time);
          res.redirect('/create_test');
          break;
        case '0':
          req.flash('success', 'Test created for Basic on ' + built_date + ' at ' + item.time);
          res.redirect('/create_test');
          break;
        case '1':
          req.flash('success', 'Test created for Level 1 on ' + built_date + ' at ' + item.time);
          res.redirect('/create_test');
          break;
        case '2':
          req.flash('success', 'Test created for Level 2 on ' + built_date + ' at ' + item.time);
          res.redirect('/create_test');
          break;
        case '3':
          req.flash('success', 'Test created for Level 3 on ' + built_date + ' at ' + item.time);
          res.redirect('/create_test');
          break;
        default:
          req.flash('error', 'Test Not Created! with data: (level: ' + item.level + ', built_date: ' + built_date + ', time: ' + item.time + ')');
          console.log('Test Not Created! with data: (level: ' + item.level + ', built_date: ' + built_date + ', time: ' + item.time + ')');
          res.redirect('/create_test');
          break;
      }
    })
    .catch(function(err){
      console.log("Error in creating test: " + err);
      req.flash('error', 'Test not created. ERR: ' + err);
      res.redirect('/create_test');
    })
})

router.get('/email_lookup', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/email_lookup');
  } else {
    res.render('email_lookup', {
      email: ''
    })
  }
})

router.post('/email_lookup', (req, res) => {
  const item = {
    email: req.sanititze('email').trim()
  }
  const email = String(item.email).toLowerCase();
  res.redirect('test_email/' + email);
})

router.get('/classes_email/(:email)', (req, res) => {

})

//TESTING SIGNUP SECTION
function parse_name(name){
  const seperator = name.indexOf('/');
  const values = [];
  values.push(name.substring(0, seperator));
  values.push(Number(name.substring(seperator + 1, name.length)));
  return values;
}

router.get('/student_tests', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/student_tests');
  } else {
    res.render('student_tests', {
    })
  }
})

router.get('/testing_signup_dragons', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_dragons');
  } else {
    const name_query = "select * from get_names(-1);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = -1 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_dragons', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_dragons');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_dragons');
      })
  }
})

router.get('/testing_signup_basic', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_basic');
  } else {
    const name_query = "select * from get_names(0);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = 0 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_basic', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_basic');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_basic');
      })
  }
})

router.get('/testing_signup_level1', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_level1');
  } else {
    const name_query = "select * from get_names(1);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = 1 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_level1', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_level1');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_level1');
      })
  }
})

router.get('/testing_signup_level2', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_level2');
  } else {
    const name_query = "select * from get_names(2);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = 2 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_level2', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_level2');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_level2');
      })
  }
})

router.get('/testing_signup_level3', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_level3');
  } else {
    const name_query = "select * from get_names(1);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = 3 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_level3', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_level3');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_level3');
      })
  }
})

router.post('/testing_signup_dragons', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_dragons');
    })
})

router.post('/testing_signup_basic', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_basic');
    })
})

router.post('/testing_signup_level1', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_level1');
    })
})

router.post('/testing_signup_level2', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_level2');
    })
})

router.post('/testing_signup_level3', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_level3');
    })
})

router.get('/testing_preview', (req, res) => {
  res.render('testing_preview', {
    test_info: '',
    test_id: '',
    student_name: '',
    barcode: '',
    email: '',
    belt_color: ''
  })
})

function belt_parser(color){
  const regex_dragon = /Dragons/g;
  const regex_basic = /^White|^Gold/g;
  const regex_level1 = /^Orange|^High Orange|^Green|^High Green/g;
  const regex_level2 = /^Purple|^High Purple|^Blue|^High Blue/g;
  const regex_level3 = /^Red|^High Red|^Brown|^High Brown/g;
  if (regex_dragon.test(color)){
    return 'Dragons';
  } else if (regex_basic.test(color)){
    return 'Basic';
  } else if (regex_level1.test(color)){
    return 'Level 1';
  } else if (regex_level2.test(color)){
    return 'Level 2';
  } else if (regex_level3.test(color)){
    return 'Level 3';
  } else {
    return 'Unknown';
  }
}

router.post('/test_preview', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belt_color').trim(),
    test_id: req.sanitize('test_id').trim(),
    barcode: req.sanitize('barcode').trim(),
    button: req.sanitize('button')
  };
  if (item.button == 'Submit'){
    const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
    db.any(test_instance, [item.test_id])
      .then(rows => {
        if (item.email == 'exclusivemartialarts@gmail.com'){
          res.render('testing_confirmed', {
            student_name: 'Master Young',
            email: 'master_young@ninja.com',
            belt_color: item.belt_color,
            test_instance: rows
          })
        } else {
          const insert_query = "insert into test_signups (student_name, test_id, belt_color, email, barcode) values ($1, $2, $3, $4, $5) on conflict(session_id) do nothing;";
          db.any(insert_query, [item.student_name, item.test_id, item.belt_color, item.email, item.barcode])
            .then(rows => {
              req.flash('success', 'Successfully signed up for testing!');
              res.render('testing_confirmed', {
                student_name: item.student_name,
                email: item.email,
                belt_color: item.belt_color,
                test_instance: rows
              })
            })
            .catch(err => {
              console.log('Could not add to test_signups. ERROR: ' + err);
              req.flash('error', 'Could not sign up for test.');
              res.redirect('/testing_signup_basic');
            })
        }
      })
      .catch(err => {
        console.log('Could not confirm test. ERROR: ' + err);
        req.flash('error', 'Cound not complete signup. Please see staff member.');
        res.redirect('/testing_signup_basic');
      })
  } else {
    const name_query = "select * from get_names($1);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = $1 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    switch (belt_parser(item.belt_color)){
      case 'Dragons':
        db.any(name_query, [-1])
          .then(rows_names => {
            db.any(tests, [-1])
              .then(rows => {
                res.render('testing_signup_dragons', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_dragons');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_dragons');
          })
        break;
      case 'Basic':
        db.any(name_query, [0])
          .then(rows_names => {
            db.any(tests, [0])
              .then(rows => {
                res.render('testing_signup_basic', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_basic');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_basic');
          })
        break;
      case 'Level 1':
        db.any(name_query, [1])
          .then(rows_names => {
            db.any(tests, [1])
              .then(rows => {
                res.render('testing_signup_level1', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_level1');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_level1');
          })
        break;
      case 'Level 2':
        db.any(name_query, [2])
          .then(rows_names => {
            db.any(tests, [2])
              .then(rows => {
                res.render('testing_signup_level2', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_level2');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_level2');
          })
        break;
      case 'Level 3':
        db.any(name_query, [3])
          .then(rows_names => {
            db.any(tests, [3])
              .then(rows => {
                res.render('testing_signup_level3', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_level3');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_level3');
          })
        break;
      default:
        console.log('Unknown level for Edit');
        break;
    }
  }
})

app.post('/webhook', (request, response) => {
  let event
  try {
    console.log('event is ' + event)
  } catch (err) {
    response.status(400).send(`Webhook Error: ${err.message}`)
  }

  // Handle the event
  switch (request.body.type) {
    case 'customer.deleted':
      const studentCode = request.body.data.object.metadata.barcode
      var query = 'delete from student_list where barcode = $1;'
      db.none(query, [studentCode])
      break
    case 'charge.failed':
      const amount = request.body.data.object.amount
      const customer = request.body.data.object.customer
      const email = request.body.data.object.billing_details.email
      const reason = request.body.data.object.outcome.reason
      const failed_query = 'insert into failed_payments (customer, amount, reason, email) values ($1, $2, $3, $4);'
      db.any(failed_query, [customer, amount, reason, email])
        .then(function (row) {
          console.log('Added a charge.failed webhook')
        })
        .catch(function (err) {
          console.log('charge.failed ended with err ' + err)
        })
      break
      // create database, add details to database, have button on home with failed payments and the number of rows in db
      // have resolved button that deletes from database

      // break;
      // ... handle other event types
    default:
      // Unexpected event type
      return response.status(400).end()
  }

  // Return a response to acknowledge receipt of the event
  response.json({ received: true })
})

app.listen(port, () => {
  console.info('EMA-Planner running on port', port)
})

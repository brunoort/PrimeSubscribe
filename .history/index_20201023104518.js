var express = require('express');
var bodyParser = require('body-parser');
var rp = require('request-promise');

var domainFast = 'apiqa.fastshop.com.br';
var redomainFast = 'fastshop-qa';

var vindiToken = 'Basic eFE2OFZxU1JJQVpTeGpyWHlnSWRQVGFRWTFLTm9BWFBSUFgway0wZHNvODo=';
var vindiPublicToken = 'Basic dWFIR1pKTDY1cHhzRjhzNGRfVTliUkN3Q3cxNUhBNXdaYzV5NzFLaEZZQTo=';

var app = express();
app.use(bodyParser.urlencoded({
    extended: false
}))

app.use(bodyParser.json())

//A chamada vai ser via CPF
app.get('/subscription/:cpf', function (req, res) {

    res.setHeader("Content-Type", "application/json");
    var reqHeader = req.headers;
    var reqBody = req.body;

    var customerCPF = req.params.cpf;

    var customerResponse = '';
    var subsResponse = '';
    var billsResponse = '';
    var installationResponse = '';
    var beneficitsResponse = [];

    if (reqHeader.wctoken !== "" && reqHeader.wctoken !== null) {

        checkCustomer(customerCPF)
            .then(allCustomerResult => {
                //console.log(allCustomerResult);
                if (allCustomerResult.customers.length > 0) {
                    customerResponse = {
                        name: allCustomerResult.customers[0].name
                    };
                    return allCustomerResult;
                } else {
                    res.status(404).end(JSON.stringify({
                        message: 'Você não possui uma `assinatura PRIME.',
                        statusCode: 110,
                        data: null
                    }));
                }
            })
            .then(resp => {
                var findActiveCustomer = false;
                let selCustomer = [];

                resp.customers.forEach(customer => {
                    // console.log("Customer", customer);

                    var cancelAt = customer.cancel_at;
                    var startAt = customer.start_at;

                    var vStartAt = startAt.split('T');
                    var startAtArr = vStartAt.split('-');
            

                    var theDate = new Date(startAtArr[0],startAtArr[1], startAtArr[2]);
                    var myNewDate = new Date(theDate);
                    myNewDate.setDate(myNewDate.getDate() + 7);
                    console.log(myNewDate);



                    if (customer.status === "active" && (customer.overdue_since === '' || customer.overdue_since === null || customer.overdue_since === undefined)) {
                        findActiveCustomer = true;
                        selCustomer.push(customer);
                    } else if (customer.status === "canceled" && (customer.overdue_since === '' || customer.overdue_since === null || customer.overdue_since === undefined)) {

                    }
                })

                // if (findActiveCustomer === false) {

                //     console.log(customerResponse);

                //     res.status(404).end(JSON.stringify({
                //         message: 'Não foi encontrada contas ativas',
                //         statusCode: 404,
                //         data: []
                //     }));

                // } else {
                //     return selCustomer;
                // }

                selCustomer.push(resp.customers[0]);
                return selCustomer;

            })
            .then(selectedCustomer => {

                var customerRegistryCode = selectedCustomer[0].registry_code;
                var customerId = selectedCustomer[0].id;

                if (customerCPF === customerRegistryCode) {

                    // console.log("customerId", customerId);
                    getCustomerSubsById(customerId)
                        .then(customerRes => {

                            let activeSubs = [];

                            //console.log(customerRes.subscriptions);

                            if (customerRes.subscriptions.length > 0) {
                                customerRes.subscriptions.forEach(subs => {
                                    if (subs.status === 'active') {
                                        activeSubs.push(subs);
                                    } else {
                                        //Fabrizio 14/10 - tratamento de assinatura cancelada
                                        //res.status(404).end(JSON.stringify({
                                        //    message: 'Assinatura PRIME cancelada',
                                        //    statusCode: 404,
                                        //    data: null
                                        //}));
                                        //return Promise.reject();
                                        subs.status = 'inactive';
                                        activeSubs.push(subs);
                                    }
                                });

                                if (activeSubs.length === 0) {
                                    const subSize = customerRes.subscriptions.length;
                                    const subs = customerRes.subscriptions[0];
                                    activeSubs.push(subs);
                                }

                                return activeSubs;

                            } else {
                                res.status(404).end(JSON.stringify({
                                    message: 'Você não possuí uma assinatura PRIME',
                                    statusCode: 404,
                                    data: []
                                }));
                                return Promise.reject();
                            }

                        })
                        .then(activeSubscribe => {
                            //console.log("accf", activeSubscribe);
                            subsResponse = createSubsBody(activeSubscribe[0]);
                            //console.log("subsResponse", subsResponse);
                            return subsResponse;
                        })
                        .then(() => {
                            getCustomerBills(customerId)
                                .then(billsRes => {
                                    //console.log("billsRes", billsRes);
                                    billsResponse = createBillsBody(billsRes);
                                })
                                .then(() => {
                                    getBenefits()
                                        .then(resBenefits => {
                                            //console.log(resBenefits.plans);
                                            resBenefits.plans.forEach(plan => {
                                                beneficitsResponse.push(plan);
                                            });
                                        })
                                })
                                .then(() => {
                                    //verificar instalações gratuitas no GAN
                                    getCustomerInstallations(reqHeader.wctoken, reqHeader.wctrustedtoken, customerCPF)
                                        .then((serviceInstResponse) => {
                                            //console.log("serviceInstResponse", serviceInstResponse);
                                            installationResponse = processServiceInstallation(serviceInstResponse);
                                        })
                                        .then(() => {

                                            //clean result
                                            //console.log('subs', subsResponse);

                                            if (subsResponse.status === 'active') {
                                                delete subsResponse.plan.code;
                                                delete subsResponse.current_period.id;
                                                delete subsResponse.current_period.billing_at;
                                                delete subsResponse.current_period.cycle;
                                                delete subsResponse.current_period.duration;
                                            }

                                            billsResponse.forEach(billSub => {
                                                delete billSub.subscription.code;
                                                delete billSub.subscription.plan.code;
                                                delete billSub.subscription.customer;
                                            });

                                            //Formating all response information
                                            const formatedResponse = formatingResponse(customerResponse, subsResponse, billsResponse, installationResponse, beneficitsResponse);
                                            res.status(200).end(JSON.stringify(formatedResponse));
                                        });
                                })
                        })
                        .catch((err) => {
                            res.status(400).end(JSON.stringify({
                                message: 'Não foi possível recuperar sua assinatura',
                                statusCode: 120,
                                data: []
                            }));

                        });

                } else {
                    //Pesquisa não autorizada
                    res.status(500).end(JSON.stringify({
                        message: 'Pesquisa inválida',
                        statusCode: 500,
                        data: []
                    }));

                }
            })
            .catch((err) => {

                res.status(400).end(JSON.stringify({
                    message: 'Não foi possível recuperar sua assinatura',
                    statusCode: 120,
                    data: null
                }));

            });
    } else {
        res.status(500).end(JSON.stringify({
            message: 'Token inválido',
            statusCode: 500,
            data: []
        }));
    }
});

app.post('/subscription', function (req, res) {
    res.setHeader("Content-Type", "application/json");
    var reqHeader = req.headers;
    var reqBody = req.body;

    var customerInfo = '';
    var addressInfo = '';
    var idVindiCustomer = '';
    var vindiGatewayToken = '';
    var customer;

    var validationMsg = callValidators(reqBody, reqHeader);
    //console.log(validationMsg);

    if (validationMsg === null) {
        let promises = [];

        promises.push(getCustomerInfo(reqHeader.wctoken, reqHeader.wctrustedtoken));
        promises.push(getCustomerAddresses(reqHeader.wctoken, reqHeader.wctrustedtoken));

        Promise.all(promises)
            .then((vResult) => {
                //console.log("vResult:", vResult);
                customerInfo = vResult[0];
                addressInfo = vResult[1];
                if (customerInfo === null && addressInfo === null) {
                    res.status(400).end(JSON.stringify({
                        message: 'Token inválido',
                        statusCode: 99,
                        data: null
                    }));
                }

                //INVALIDAR CADASTROS VIA CNPJ
                if (customerInfo.cpf.length > 11) {
                    res.status(400).end(JSON.stringify({
                        message: 'Não é possível cadastrar via CNPJ',
                        statusCode: 99,
                        data: null
                    }));
                }

                return checkCustomer(customerInfo.cpf)
                    .then((checkResult) => {
                        //console.log(JSON.stringify(checkResult.customers));

                        let customerIsActive = false;

                        if (checkResult.customers.length > 0) {

                            customer = checkResult.customers[0];

                            // VERIFICA SE O STATUS DO CLIENTE ESTA ATIVO
                            checkResult.customers.forEach(customer => {
                                if (customer.status === 'active') {
                                    customerIsActive = true;
                                }
                            });

                            // CHECA SE ELE NAO ESTA ATIVO ENTAO POSSO 
                            if (customerIsActive) {

                                res.status(400).end(JSON.stringify({
                                    message: 'Esse usuário já possuí uma assinatura',
                                    statusCode: 50,
                                    data: null
                                }));

                                return promise.reject();

                            } else {
                                return vResult;
                            }
                        } else {
                            var vindiCustomerObj = createVindiCustomerObj(reqBody, customerInfo, addressInfo);

                            // console.log("vindiCustomerObj", vindiCustomerObj);

                            return postVindiCustomer(vindiCustomerObj)
                                .then(sendResult => {

                                    //console.log("sendResult", sendResult);

                                    if (sendResult === null) {

                                        res.status(400).end(JSON.stringify({
                                            message: 'Customer code já está em uso - vindi',
                                            statusCode: 99,
                                            data: null
                                        }));

                                        return promise.reject();

                                    } else {
                                        customer = sendResult.customer;
                                    }
                                });
                        }
                    })
            })
            .then(() => {

                //console.log('ENTREI');
                //console.log(reqBody);

                idVindiCustomer = customer.id;
                var vindiPaymentObj = createVindiPaymentObj(reqBody);

                //console.log(vindiPaymentObj);

                return postVindiCardPayment(vindiPaymentObj)
                    .then(sendPaymentResult => {

                        //console.log('sendPaymentResult', sendPaymentResult);

                        if (sendPaymentResult === null) {

                            res.status(400).end(JSON.stringify({
                                message: 'Erro ao enviar pagamento - vindi',
                                statusCode: 100,
                                data: null
                            }));

                            return promise.reject();

                        } else {
                            return sendPaymentResult;
                        }
                    });
            })
            .then((paymentResult => {
                vindiGatewayToken = paymentResult.payment_profile.gateway_token;
                var paymentProfile = createVindiPaymentProfileObj(idVindiCustomer, vindiGatewayToken);

                return postVindiPaymentProfile(paymentProfile)
                    .then(paymentProfileResult => {
                        if (paymentProfileResult === null) {
                            res.status(400).end(JSON.stringify({
                                message: 'Erro ao enviar profile de pagto - vindi',
                                statusCode: 101,
                                data: null
                            }));

                            return promise.reject();
                        } else {
                            return paymentProfileResult;
                        }
                    });
            }))
            .then((paymentProfileResult => {

                //console.log(paymentProfileResult.payment_profile.status);

                if (paymentProfileResult.payment_profile.status === 'active') {
                    var subscribeObj = createVindiSubscribe(idVindiCustomer, reqBody);

                    // console.log(subscribeObj);

                    return postVindiSubscribe(subscribeObj)
                        .then(subscribeResult => {

                            //console.log("subscribeResult", subscribeResult);
                            if (subscribeResult === null) {
                                res.status(400).end(JSON.stringify({
                                    message: 'Erro ao enviar subscribe - vindi',
                                    statusCode: 99,
                                    data: null
                                }));

                                return promise.reject();
                            } else {
                                //fabrizio 15/09
                                if (subscribeResult.bill.status !== 'paid') {
                                    console.log("Bill status:", subscribeResult.bill.status);

                                    // Assinatura deve ser removida.
                                    postVindiUnsubscribe(subscribeResult.subscription.id)
                                        .then(unsubscribeResult => {

                                            //console.log("status", unsubscribeResult.subscription.status);

                                            if (unsubscribeResult.subscription.status !== 'paid') {
                                                res.status(400).end(JSON.stringify({
                                                    message: 'Pagamento não aprovado',
                                                    statusCode: 100,
                                                    data: null
                                                }));
                                                return promise.reject();
                                            }
                                        });
                                } else {
                                    //return subscribeResult;
                                    //console.log(subscribeResult.subscription.id);
                                    //fabrizio 15/09
                                    if (subscribeResult.bill.status === 'paid') {
                                        res.status(200).end(JSON.stringify({
                                            message: 'Pagamento aprovado',
                                            statusCode: 200,
                                            data: {
                                                date: new Date(),
                                                subscriptionId: subscribeResult.subscription.id,
                                                orderStatus: subscribeResult.bill.status
                                            }
                                        }));
                                    }
                                    /*else if (subscribeResult.bill.status === 'pending') {
                                        res.status(201).end(JSON.stringify({
                                            message: 'Assinatura criada com sucesso - status pendente',
                                            statusCode: 201,
                                            data: [{
                                                date: new Date(),
                                                subscriptionId: subscribeResult.subscription.id,
                                                orderStatus: subscribeResult.bill.status
                                            }]
                                        }));
                                    }*/
                                }
                            }
                        });

                } else {
                    res.status(400).end(JSON.stringify({
                        message: 'Payment profile reprovado - vindi',
                        statusCode: 100,
                        data: null
                    }));

                    return promise.reject();
                }
            }))
            .catch((err) => {

                res.status(400).end(JSON.stringify({
                    message: 'Erro genérico - ' + err.message,
                    statusCode: 99,
                    data: null
                }));

            });
    } else {
        res.status(400).end(JSON.stringify({
            message: 'Campo ' + validationMsg + ' obrigatório',
            statusCode: 99,
            data: {
                required_fields: [validationMsg]
            }
        }));


    }
});

app.listen(process.env.PORT || 3000, function () {
    console.log('Example app listening on port 3000!');
});

function formatDate(date) {
    //"2020-09-11T00:00:00.000-03:00"
    if (date !== null) {
        var newDateArr = date.split('T');
        return newDateArr[0];
    } else {
        return null;
    }
}

function formatDateExpiration(date) {
    var newDate = formatDate(date);
    var vNewDate = newDate.split('-');

    return vNewDate[1] + '/' + vNewDate[0];
}

function formatingResponse(customerResponse, subsResponse, billsResponse, installationResponse, beneficitsResponse) {


    var vPlan = null;
    if (subsResponse.plan !== null) {
        vPlan = {
            id: subsResponse.plan.id,
            name: subsResponse.plan.name,
            benefits: null
        }

        //Beneficios
        //console.log(subsResponse.plan.id)
        //console.log(beneficitsResponse);

        beneficitsResponse.forEach(plan => {
            if (parseInt(plan.partner.planId) === parseInt(subsResponse.plan.id)) {
                //console.log(plan.benefits);
                vPlan.benefits = plan.benefits;
            }
        });
    } else {
        // console.log(subsResponse.id)
        // console.log(billsResponse);

        billsResponse.forEach(bill => {
            if (bill.subscription.id === subsResponse.id) {
                vPlan = {
                    id: bill.subscription.plan.id,
                    name: bill.subscription.plan.name,
                    benefits: null
                }
            }

            beneficitsResponse.forEach(plan => {
                if (parseInt(plan.partner.planId) === parseInt(bill.subscription.plan.id)) {
                    //console.log(plan.benefits);
                    vPlan.benefits = plan.benefits;
                }
            });
        });
    }
    //fabrizio 15/10 tratar payment_profile null para status cancelado e se vigencia for maior q data atual sera ativo
    var mData = new Date();
    var mDataVigencia = new Date(subsResponse.current_period.end_at);
    if (subsResponse.status === 'active') {
        var vPaymentCard = {
            card: {
                endNumber: subsResponse.payment_profile.card_number_last_four,
                expirationDate: formatDateExpiration(subsResponse.payment_profile.card_expiration),
                brandName: subsResponse.payment_profile.payment_company.name
            }
        };
    } else if (mDataVigencia > mData) {
        if (subsResponse.payment_profile !== null) {
            var vPaymentCard = {
                card: {
                    endNumber: subsResponse.payment_profile.card_number_last_four,
                    expirationDate: formatDateExpiration(subsResponse.payment_profile.card_expiration),
                    brandName: subsResponse.payment_profile.payment_company.name
                }
            };
        }
        // fabrizio 22/10 - muda o status para ativo de um cliente com assinatura vigente
        subsResponse.status = 'active';
    } else {
        var vPaymentCard = null;
    }

    //Subscription
    const newSubsResp = {
        "id": subsResponse.id,
        "status": subsResponse.status,
        "startAt": formatDate(subsResponse.start_at),
        "endAt": formatDate(subsResponse.end_at),
        "nextBillingAt": formatDate(subsResponse.next_billing_at),
        "plan": vPlan,
        "interval": subsResponse.interval,
        "intervalCount": subsResponse.interval_count,
        "installments": subsResponse.installments,
        "price": parseFloat(subsResponse.price),
        "monthlyPrice": parseFloat(subsResponse.monthlyPrice),

        "currentPeriod": {
            "startAt": formatDate(subsResponse.current_period.start_at),
            "endAt": formatDate(subsResponse.current_period.end_at),
        },
        "payment": vPaymentCard
    };

    //Bills
    const newBillsResp = [];
    billsResponse.forEach(bill => {
        //console.log(bill);
        newBillsResp.push({
            id: bill.id,
            amount: parseFloat(bill.amount),
            installments: bill.installments,
            status: bill.status,
            createdAt: formatDate(bill.created_at),
            dueAt: formatDate(bill.due_at),
            paidAt: formatDate(bill.paid_at),
            subscription: bill.subscription
        });
    });

    var newInstallationResponse = null;
    //Installation  
    if (installationResponse !== null) {
        newInstallationResponse = {
            total: installationResponse.usageControl.totalAmount,
            used: installationResponse.usageControl.amountUsed,
            balance: installationResponse.usageControl.balance
        }
    } else {
        newInstallationResponse = null;
    }

    //fabrizio 20/10 - se for assinante prime nao retorna instalacao nulo
    if (subsResponse.plan !== null) {
        if (subsResponse.plan.name == 'Prime') {
            //console.log('assinante',subsResponse.plan.name);
            newInstallationResponse = null;
        }
    }

    return {
        customer: customerResponse,
        subscription: newSubsResp,
        bills: newBillsResp,
        installation: newInstallationResponse
    }

}

function callValidators(body, header) {

    if (header.wctoken === "" || header.wctoken === null || header.wctoken === undefined) {
        return "wcToken";
    }

    if (header.wctrustedtoken === "" || header.wctrustedtoken === null || header.wctrustedtoken === undefined) {
        return "wcTrustedToken";
    }

    if (body.email === null || body.email === "" || body.email === undefined) {
        return "email";
    } else if (body.planId === null || body.planId === "" || body.planId === undefined) {
        return "planId";
    } else if (body.productId === null || body.productId === "" || body.productId === undefined) {
        return "productId";
    } else if (body.cardNumber === null || body.cardNumber === "" || body.cardNumber === undefined) {
        return "cardNumber";
    } else if (body.holderName === null || body.holderName === "" || body.holderName === undefined) {
        return "holderName";
    } else if (body.expireDate === null || body.expireDate === "" || body.expireDate === undefined) {
        return "expireDate";
    } else if (body.document === null || body.document === "" || body.document === undefined) {
        return "document";
    } else if (body.cvv === null || body.cvv === "" || body.cvv === undefined) {
        return "cvv";
    } else {
        return null;
    }
}

function processServiceInstallation(serviceQtdResponse) {
    //console.log("serviceQtdResponse", serviceQtdResponse);
    if (serviceQtdResponse.error === null || serviceQtdResponse.error === undefined) {
        if (serviceQtdResponse.serviceInstall[0].serviceID !== null && serviceQtdResponse.serviceInstall[0].serviceID !== undefined && serviceQtdResponse.serviceInstall[0].serviceID !== "") {
            //var vAmountUsed = serviceQtdResponse.serviceInstall.length;
            // condicao ternaria onde a qtd de servicos nao pode ser maio que 2 - fabrizio 20/10
            var vAmountUsed = serviceQtdResponse.serviceInstall.length > 2 ? 0 : serviceQtdResponse.serviceInstall.length;
            var vTotalAmount = 2;
            var vBalance = vTotalAmount - vAmountUsed;

            return {
                "usageControl": {
                    "totalAmount": vTotalAmount,
                    "amountUsed": vAmountUsed,
                    "balance": vBalance
                }
            }
        } else {
            return null;
        }
    } else {
        return null;
    }

}

function createBillsBody(billResponse) {
    var arrBills = [];

    billResponse.bills.forEach(bill => {

        //console.log("bills", bill.charges[0].paid_at);

        arrBills.push({
            "id": bill.id,
            "amount": bill.amount,
            "installments": bill.installments,
            "status": bill.status,
            "created_at": bill.created_at,
            "due_at": bill.due_at,
            "paid_at": bill.charges[0].paid_at,
            "subscription": bill.subscription
        })
    });

    return arrBills;
}

function createSubsBody(subsResponse) {
    try {
        //console.log("subsResponse", subsResponse);
        var vPlan = null;
        var vPrice = null;

        if (subsResponse.status === 'active') {
            vPrice = getPrice(subsResponse.product_items[0].pricing_schema);
            vPlan = subsResponse.plan;
        } else {
            //vPrice = null;
            vPrice = getPrice(subsResponse.product_items[0].pricing_schema);
            vPlan = null;
        }

        var vInstallments = subsResponse.installments;

        // fabrizio 22/10 - se a data de vigencia estiver ativo o cliente passa de inativo para ativo e demonstra os pagtos
        var mData = new Date();
        var mDataVigencia = new Date(subsResponse.current_period.end_at);
        //console.log('profile',subsResponse.payment_profile);

        //fabrizio 15/10 tratar payment_profile null para status cancelado
        if (subsResponse.status === 'active') {
            var vPaymentProfile = {
                card_expiration: subsResponse.payment_profile.card_expiration,
                card_number_first_six: subsResponse.payment_profile.card_number_first_six,
                card_number_last_four: subsResponse.payment_profile.card_number_last_four,
                payment_company: subsResponse.payment_profile.payment_company
            };

            delete vPaymentProfile.payment_company.id;
        } else {
            var vPaymentProfile = null;
        }

        // fabrizio - 22/10 - tratamento dos dados de pagto se a data de vigencia do assinante inativo estiver ok
        if (mDataVigencia > mData) {
            if (subsResponse.payment_profile !== null) {
                var vPaymentProfile = {
                    card_expiration: subsResponse.payment_profile.card_expiration,
                    card_number_first_six: subsResponse.payment_profile.card_number_first_six,
                    card_number_last_four: subsResponse.payment_profile.card_number_last_four,
                    payment_company: subsResponse.payment_profile.payment_company
                };

                delete vPaymentProfile.payment_company.id;
            }
        }

        return {
            id: subsResponse.id,
            status: convertStatus(subsResponse.status, subsResponse.overdue_since),
            start_at: subsResponse.start_at,
            end_at: subsResponse.end_at,
            next_billing_at: subsResponse.next_billing_at,
            plan: vPlan,
            interval: subsResponse.interval,
            interval_count: subsResponse.interval_count,
            installments: subsResponse.installments,
            price: vPrice,
            monthlyPrice: getMonthlyPrice(vPrice, vInstallments),
            current_period: subsResponse.current_period,
            payment_profile: vPaymentProfile

        }
    } catch (err) {
        console.log(err.message);
    }
}

function getMonthlyPrice(price, installments) {
    return (price / installments).toFixed(2);
}

function getPrice(schema) {
    if (schema) {
        return schema.price;
    } else {
        return 0;
    }
}

function convertStatus(status, overdue) {
    switch (status) {
        case 'active':
            if (overdue === null || overdue === '') {
                return 'active';
            } else {
                return 'inactive';
            }
            break;
        case 'canceled':
            return 'canceled'
            break;
        default:
            return 'inactive'
            break;
    }
}

function getRandomIntInclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getCustomerInstallations(vWcToken, vWcTrustedToken, cpf) {

    return new Promise((resolve, reject) => {
        const url = 'https://' + domainFast + '/v1/consultServiceInstallQuantity?cpf=' + cpf + '&flagService=FREE';
        var options = {
            uri: url,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'WCToken': vWcToken,
                'WCTrustedToken': vWcTrustedToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                // console.log(parsedBody);
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function getCustomerBills(id) {
    return new Promise((resolve, reject) => {
        const url = 'https://sandbox-app.vindi.com.br:443/api/v1/bills?query=customer_id:' + id.toString() + '&sort_by=created_at&sort_order=desc';
        var options = {
            uri: url,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'Authorization': vindiToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function getBenefits() {
    //console.log(registryCode);
    return new Promise((resolve, reject) => {
        //const url = 'https://promotion-fast.herokuapp.com/promotion-management/api/v1/fast-prime/plan';
        //Fabrizio - 14/10 - mudanca da url do herokuapp para apigee
        const url = 'https://' + domainFast + '/promotion-management/api/v1/fast-prime/plan/simulator';
        var options = {
            uri: url,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                //console.log(parsedBody);
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function getCustomerSubsById(id) {
    return new Promise((resolve, reject) => {
        const url = 'https://sandbox-app.vindi.com.br:443/api/v1/subscriptions?query=customer_id:' + id.toString() + '&sort_by=created_at&sort_order=desc';
        var options = {
            uri: url,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'Authorization': vindiToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function checkCustomer(registryCode) {
    //console.log(registryCode);
    return new Promise((resolve, reject) => {
        const url = 'https://sandbox-app.vindi.com.br/api/v1/customers?query=registry_code:' + registryCode;
        var options = {
            uri: url,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'Authorization': vindiToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                //console.log(parsedBody);
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function getCustomerInfo(vWcToken, vWcTrustedToken) {
    return new Promise((resolve, reject) => {
        const url = 'https://' + domainFast + '/wcs/v1/customer';
        var options = {
            uri: url,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'WCToken': vWcToken,
                'WCTrustedToken': vWcTrustedToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                //console.log(parsedBody);
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function getCustomerAddresses(vWcToken, vWcTrustedToken) {
    return new Promise((resolve, reject) => {
        const url = 'https://' + domainFast + '/' + redomainFast + '/wcs/resources/v1/customer/addresses';
        var options = {
            uri: url,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'WCToken': vWcToken,
                'WCTrustedToken': vWcTrustedToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                // console.log(parsedBody);

                parsedBody.addresses.forEach(address => {
                    if (address.isMainAddress === true) {
                        resolve(address);
                    }
                });
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function postVindiSubscribe(subscribeBody) {
    return new Promise((resolve, reject) => {
        const url = 'https://sandbox-app.vindi.com.br:443/api/v1/subscriptions';
        var options = {
            uri: url,
            method: 'POST',
            body: subscribeBody,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'Authorization': vindiToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function postVindiCustomer(customerBody) {
    return new Promise((resolve, reject) => {
        const url = 'https://sandbox-app.vindi.com.br:443/api/v1/customers';
        var options = {
            uri: url,
            method: 'POST',
            body: customerBody,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'Authorization': vindiToken
            },
            json: true
        };

        // console.log(customerBody);

        rp(options).then(function (parsedBody) {
                resolve(parsedBody);
            })
            .catch(function (err) {
                // console.log(err.message);
                resolve(null);
            });
    })
}

function postVindiCardPayment(paymentBody) {
    //console.log("payBody", paymentBody);
    return new Promise((resolve, reject) => {
        const url = 'https://sandbox-app.vindi.com.br/api/v1/public/payment_profiles';
        var options = {
            uri: url,
            method: 'POST',
            body: paymentBody,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'Authorization': vindiPublicToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function postVindiPaymentProfile(paymentBody) {
    return new Promise((resolve, reject) => {
        const url = 'https://sandbox-app.vindi.com.br:443/api/v1/payment_profiles';
        var options = {
            uri: url,
            method: 'POST',
            body: paymentBody,
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'Authorization': vindiToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

function postVindiUnsubscribe(id) {
    return new Promise((resolve, reject) => {
        const url = 'https://sandbox-app.vindi.com.br:443/api/v1/subscriptions/' + id;
        var options = {
            uri: url,
            method: 'DELETE',
            headers: {
                'User-Agent': 'Request-Promise',
                'Accept': '*/*',
                'Authorization': vindiToken
            },
            json: true
        };

        rp(options).then(function (parsedBody) {
                resolve(parsedBody);
            })
            .catch(function (err) {
                resolve(null);
            });
    })
}

//CREATE OBJECTS

function createVindiSubscribe(idVindiCustomer, reqBody) {
    return {
        "plan_id": reqBody.planId,
        "customer_id": idVindiCustomer,
        "payment_method_code": "credit_card",
        "product_items": [{
            "product_id": reqBody.productId
        }],
        "metadata": {
            "version_terms_conditions": "1.0.0"
        }
    }
}

function createVindiPaymentProfileObj(idVindiCustomer, vindiGatewayToken) {
    return {
        "gateway_token": vindiGatewayToken,
        "customer_id": idVindiCustomer
    }
}

function createVindiPaymentObj(reqBody) {
    return {
        "holder_name": reqBody.holderName,
        "card_expiration": reqBody.expireDate,
        "card_number": reqBody.cardNumber,
        "card_cvv": reqBody.cvv,
        "payment_method_code": "credit_card"
    };
}

//Fabrizio 14/10 tratamento digito 9 para numero celular
function cleanPhone(dirtyPhone) {

    let phone = dirtyPhone.replace(/\D/g, '');

    if (phone.length === 11 && phone.substring(2, 3)) {
        phone = phone.substring(0, 2) + '9' + phone.substring(3, phone.length);
    }
    return phone;
}

function createVindiCustomerObj(reqBody, customerInfo, addressInfo) {
    var registryCode = customerInfo.cpf;
    // console.log(registryCode);

    //Fabrizio 14/10 tratamento do digito 9 para celular
    //var phoneNumber = addressInfo.telephone.replace('(', '').replace(')', '').replace('-', '').trim();
    var phoneNumber = cleanPhone(addressInfo.telephone);
    return {
        "name": customerInfo.name,
        "email": reqBody.email,
        "registry_code": customerInfo.cpf, //cpf
        "code": registryCode,
        "notes": customerInfo.rg,
        "address": {
            "street": addressInfo.streetName,
            "number": addressInfo.number,
            "additional_details": addressInfo.complement,
            "zipcode": addressInfo.zipCode,
            "neighborhood": addressInfo.district,
            "city": addressInfo.city,
            "state": addressInfo.state,
            "country": "BR"
        },
        "phones": [{
            "phone_type": "mobile",
            "number": '55' + phoneNumber
        }]
    }
}
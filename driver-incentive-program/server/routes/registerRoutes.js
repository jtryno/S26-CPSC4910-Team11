import authRouter from '../features/auth/auth.routes.js';
import notificationsRouter from '../features/notifications/notifications.routes.js';
import systemRouter from '../features/system/system.routes.js';
import organizationsRouter from '../features/organizations/organizations.routes.js';
import applicationsRouter from '../features/applications/applications.routes.js';
import usersRouter from '../features/users/users.routes.js';
import pointsRouter from '../features/points/points.routes.js';
import catalogRouter from '../features/catalog/catalog.routes.js';
import shoppingRouter from '../features/shopping/shopping.routes.js';
import ordersRouter from '../features/orders/orders.routes.js';
import supportTicketsRouter from '../features/supportTickets/supportTickets.routes.js';
import reviewsRouter from '../features/reviews/reviews.routes.js';
import messagesRouter from '../features/messages/messages.routes.js';
import adminRouter from '../features/admin/admin.routes.js';
import reportsRouter from '../features/reports/reports.routes.js';

export function registerRoutes(app) {
    app.use('/api', authRouter);
    app.use('/api', notificationsRouter);
    app.use('/api', systemRouter);
    app.use('/api', organizationsRouter);
    app.use('/api', applicationsRouter);
    app.use('/api', usersRouter);
    app.use('/api', pointsRouter);
    app.use('/api', catalogRouter);
    app.use('/api', shoppingRouter);
    app.use('/api', ordersRouter);
    app.use('/api', supportTicketsRouter);
    app.use('/api', reviewsRouter);
    app.use('/api', messagesRouter);
    app.use('/api', adminRouter);
    app.use('/api', reportsRouter);
}

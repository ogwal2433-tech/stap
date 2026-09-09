import swaggerJsdoc from 'swagger-jsdoc';
import { APP_NAME } from '../config/branding';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: `${APP_NAME} Management API`,
      version: '1.0.0',
      description:
        'REST API for STAP Security Ltd web management platform. ' +
        'Covers guards, clients, attendance, finance, HR, inventory, and notifications.',
      contact: { name: 'STAP Security IT', email: 'it@stapsecurity.co.ug' },
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Development' },
      { url: 'http://185.194.218.245', description: 'Staging' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            error: { type: 'string' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
                hasNext: { type: 'boolean' },
                hasPrev: { type: 'boolean' },
              },
            },
          },
        },
        Guard: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            fullName: { type: 'string' },
            nationalId: { type: 'string' },
            phone: { type: 'string' },
            salaryRate: { type: 'integer' },
            employmentStatus: { type: 'string', enum: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Invoice: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            invoiceNumber: { type: 'string', example: 'STAP/INV/2026/0001' },
            clientId: { type: 'string', format: 'uuid' },
            guardsDeployed: { type: 'integer' },
            ratePerGuard: { type: 'integer' },
            subtotal: { type: 'integer' },
            taxAmount: { type: 'integer' },
            totalAmount: { type: 'integer' },
            status: { type: 'string', enum: ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] },
            dueDate: { type: 'string', format: 'date-time' },
            paidAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Client: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            clientName: { type: 'string' },
            contactPerson: { type: 'string' },
            contactPhone: { type: 'string' },
            physicalAddress: { type: 'string' },
            contractStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
            billingTerms: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        InventoryItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            itemCode: { type: 'string', example: 'STAP-INV-0001' },
            itemName: { type: 'string' },
            itemType: { type: 'string', enum: ['UNIFORM', 'EQUIPMENT', 'STATIONERY', 'OTHER'] },
            stockQuantity: { type: 'integer' },
            reorderThreshold: { type: 'integer' },
            unitCost: { type: 'integer' },
            isLowStock: { type: 'boolean' },
            isActive: { type: 'boolean' },
          },
        },
        SystemSetting: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            key: { type: 'string' },
            value: { type: 'string' },
            label: { type: 'string' },
            group: { type: 'string', enum: ['GENERAL', 'PAYROLL', 'BILLING', 'SECURITY', 'NOTIFICATIONS'] },
            dataType: { type: 'string', enum: ['string', 'number', 'boolean'] },
          },
        },
        Error400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Validation error' },
          },
        },
        Error401: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Unauthorised' },
          },
        },
        Error403: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Forbidden' },
          },
        },
        Error404: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Not found' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

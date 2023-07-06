import type { IExecuteFunctions } from 'n8n-core';
import type { IDataObject, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { updateDisplayOptions, wrapData } from '@utils/utilities';

import { customFieldsCollection2, observableDataType } from '../common.description';
import { theHiveApiRequest } from '../../transport';
import { convertCustomFieldUiToObject, splitTags } from '../../helpers/utils';

import FormData from 'form-data';

const properties: INodeProperties[] = [
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'resourceMapper',
		default: {
			mappingMode: 'defineBelow',
			value: null,
		},
		noDataExpression: true,
		required: true,
		typeOptions: {
			resourceMapper: {
				resourceMapperMethod: 'getAlertFields',
				mode: 'add',
				valuesLabel: 'Fields',
			},
		},
	},
	{
		displayName: 'Observables',
		name: 'observableUi',
		type: 'fixedCollection',
		placeholder: 'Add Observable',
		default: {},
		typeOptions: {
			multipleValues: true,
		},
		options: [
			{
				displayName: 'Values',
				name: 'values',
				values: [
					observableDataType,
					{
						displayName: 'Data',
						name: 'data',
						type: 'string',
						displayOptions: {
							hide: {
								dataType: ['file'],
							},
						},
						default: '',
					},
					{
						displayName: 'Binary Property',
						name: 'binaryProperty',
						type: 'string',
						displayOptions: {
							show: {
								dataType: ['file'],
							},
						},
						default: 'data',
					},
					{
						displayName: 'Message',
						name: 'message',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Tags',
						name: 'tags',
						type: 'string',
						default: '',
					},
				],
			},
		],
	},
	customFieldsCollection2,
];

const displayOptions = {
	show: {
		resource: ['alert'],
		operation: ['create'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(
	this: IExecuteFunctions,
	i: number,
	item: INodeExecutionData,
): Promise<INodeExecutionData[]> {
	let responseData: IDataObject | IDataObject[] = [];
	let body: IDataObject = {};

	const dataMode = this.getNodeParameter('fields.mappingMode', i) as string;

	if (dataMode === 'autoMapInputData') {
		body = item.json;
	}

	if (dataMode === 'defineBelow') {
		const fields = this.getNodeParameter('fields.value', i, []) as IDataObject;
		body = fields;
	}

	if (body.tags) {
		body.tags = splitTags(body.tags);
	}

	const customFieldsUi = this.getNodeParameter('customFieldsUi.values', i, {}) as IDataObject;
	body.customFields = convertCustomFieldUiToObject(customFieldsUi);

	let multiPartRequest = false;
	const formData = new FormData();

	const observableUi = this.getNodeParameter('observableUi', i) as IDataObject;
	if (observableUi) {
		const values = observableUi.values as IDataObject[];

		if (values) {
			const observables = [];

			for (const value of values) {
				const observable: IDataObject = {};

				observable.dataType = value.dataType as string;
				observable.message = value.message as string;
				observable.tags = splitTags(value.tags as string);

				if (value.dataType === 'file') {
					multiPartRequest = true;

					const attachmentIndex = `attachment${i}`;
					observable.attachment = attachmentIndex;

					const binaryPropertyName = value.binaryProperty as string;
					const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);

					formData.append(attachmentIndex, binaryData.data, {
						filename: binaryData.fileName,
						contentType: binaryData.mimeType,
					});
				} else {
					observable.data = value.data as string;
				}

				observables.push(observable);
			}
			body.observables = observables;
		}
	}

	if (multiPartRequest) {
		formData.append('_json', JSON.stringify(body));
		responseData = await theHiveApiRequest.call(
			this,
			'POST',
			'/v1/alert',
			undefined,
			undefined,
			undefined,
			{
				Headers: {
					'Content-Type': 'multipart/form-data',
				},
				formData,
			},
		);
	} else {
		responseData = await theHiveApiRequest.call(this, 'POST', '/v1/alert' as string, body);
	}

	const executionData = this.helpers.constructExecutionMetaData(wrapData(responseData), {
		itemData: { item: i },
	});

	return executionData;
}
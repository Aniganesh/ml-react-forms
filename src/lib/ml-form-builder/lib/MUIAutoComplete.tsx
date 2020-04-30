import { CircularProgress, InputBaseComponentProps, TextField } from '@material-ui/core';
import Autocomplete, { AutocompleteProps, RenderInputParams, RenderOptionState } from '@material-ui/lab/Autocomplete';
import { FormikValues } from 'formik';
import { filter, findIndex, get, reduce } from 'lodash';
import * as React from 'react';

import Highlighter from "react-highlight-words";
import { IFieldProps } from '..';

export interface IHighlighterProps { //Prop for default highlighter 
    highlightText?: boolean //this props will be used if nad only if this is true
    highlightColor?: string //Highlight color
    highlighterStyles?: object //additional highlight styles

}
type TOptions = Record<string, any>
const TIME_BETWEEN_REQS = 300;

export interface TQueries {
    term: string,
    sendAt: number,
    order: number,
    options?: TOptions[]
}

export interface IMUIAutoCompleteProps extends Partial<AutocompleteProps<TOptions>> {
    options?: TOptions[]
    renderInputProps?: RenderInputParams
    inputProps?: InputBaseComponentProps
    highlighterProps?: IHighlighterProps
    getQueryResponse?: (newTerm: string) => Promise<Array<TOptions>>
    outputKey?: string
    onItemSelected?: (value: TOptions | TOptions[]) => void
    displayKey?: string
    uniqueKey?: string
    clearOnSelect?: boolean; // default: false
}
export interface IProps extends IFieldProps {
    fieldProps?: IMUIAutoCompleteProps
}

export const MUIAutocomplete: React.FC<IProps> = (props) => {
    const [query, setQuery] = React.useState<string>();
    const { fieldProps = {} as IMUIAutoCompleteProps, formikProps = {} as FormikValues } = props
    const {
        highlighterProps = {
            highlightText: false,
            highlightColor: '#ffff00'
        } as IHighlighterProps,
        options = [],
        renderInputProps = {} as RenderInputParams,
        inputProps = {} as InputBaseComponentProps,
        getQueryResponse = undefined,
        outputKey = '',
        clearOnSelect = false,
        onItemSelected = undefined,
        displayKey = 'label',
        uniqueKey = 'key',
        ...autoCompleteProps
    } = fieldProps

    const [defaultOptions, setDefaultOptions] = React.useState<TOptions[]>([]);
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false)
    const [globalTerm, setGlobalTerm] = React.useState<string>('')
    const [globalQueries, setGlobalQueries] = React.useState<TQueries[]>([])
    const value = get(formikProps, `values.${get(fieldProps, 'name') || ''}`) || (get(fieldProps, 'multiple') ? [] : null);
    const defaultGetOptionLabel = (x: TOptions) => { return x[displayKey] }
    const handleQueryResponse = async (newTerm: string) => {
        setLoading(true);
        if (getQueryResponse) {
            const result = await getQueryResponse(newTerm);
            let newOptions: Array<TOptions> = []
            result.forEach((element) => {
                newOptions.push(element)
            })
            setLoading(false)
            return newOptions
        }
        return [];
    }
    const handleChange = async (newTerm: string, isWaitingReq: boolean = false): Promise<void> => {
        setQuery(newTerm)
        if (!newTerm) { setDefaultOptions([]); return }
        if (options.length > 0) return
        if ((isWaitingReq && globalTerm !== newTerm) || !newTerm) return;
        setGlobalTerm(newTerm)
        let queries = [...globalQueries]
        let prevQueryIndex = findIndex(queries, q => q.term === newTerm);
        let lastQueryOrder = reduce(queries, function (currentMaxId, query) {
            return Math.max(currentMaxId, query.order);
        }, -1);
        if (prevQueryIndex !== -1) {
            if (queries[prevQueryIndex].options) {
                setDefaultOptions(queries[prevQueryIndex].options || []);
            }
            else {
                queries[prevQueryIndex].order = Math.max(queries[prevQueryIndex].order, lastQueryOrder + 1);

            }
            return;
        }
        let lastQueryIndex = findIndex(queries, q => q.order === lastQueryOrder);
        let lastQuery = queries[lastQueryIndex];
        let now = new Date().getTime();
        if (lastQuery && (now - lastQuery.sendAt < TIME_BETWEEN_REQS)) {
            setGlobalQueries([...queries])
            setTimeout(() => {
                handleChange(newTerm, true)
            }, TIME_BETWEEN_REQS - (now - lastQuery.sendAt))
        }
        else {
            queries.push({
                term: newTerm,
                sendAt: now,
                order: (lastQueryOrder || 0) + 1
            });
            try {
                let newOptions = await handleQueryResponse(newTerm);
                let index = findIndex(queries, q => q.term === newTerm);
                let latestRespOrder = reduce(queries, function (currentMaxId, query) {
                    if (!query.options) return currentMaxId;
                    return Math.max(currentMaxId, query.order);
                }, -1);
                queries[index].options = newOptions;

                if (latestRespOrder < queries[index].order) {
                    setDefaultOptions(newOptions);
                }
                else {
                    // console.log('Ignoring results of:', newTerm)
                }
                setGlobalQueries([...queries])
            } catch (error) {
                console.log('error', error)
                queries = filter(queries, q => q.term !== newTerm);
                setDefaultOptions([]);
                setGlobalQueries([...queries])
            }
        }
    }

    const onItemSelect = (event: React.ChangeEvent<{}>, value: TOptions | TOptions[] | null) => {
        event.preventDefault();
        if (clearOnSelect) setQuery('');
        if (value) {
            if (onItemSelected)
                onItemSelected(value);
            else {
                formikProps.setFieldValue(get(fieldProps, 'name'), value, false)
            }
            if (outputKey)
                formikProps.setFieldValue(outputKey, value[uniqueKey], false)
        }

    }
    const defaultRenderOptions = (option: TOptions, { inputValue }: RenderOptionState) => {
        /*THIS WILL BE USED TO RENDER OPTION AND HIGHLIGHT IF USER DOESN'T PROVIDE ANY RENDER OPTIONS */
        return (
            <div>

                {
                    (highlighterProps.highlightText === false) ?
                        //NO HIGHLIGHT
                        <span>
                            {option[displayKey]}
                        </span> :
                        //DEFAULT HIGHLIGHT WITH USER STYLES IF PROVIDED
                        <Highlighter
                            searchWords={[inputValue]}
                            textToHighlight={option[displayKey]}
                            highlightStyle={{
                                backgroundColor: highlighterProps.highlightColor,
                                ...highlighterProps.highlighterStyles
                            }}
                        />
                }
            </div>
        );
    }
    return <Autocomplete
        onChange={onItemSelect}
        getOptionLabel={defaultGetOptionLabel}
        onOpen={() => { setOpen(true) }}
        open={(open && (query !== undefined && query !== ''))}
        onClose={() => { setOpen(false) }}
        options={open ? (options.length > 0 ? options : defaultOptions) : []}
        renderOption={defaultRenderOptions}
        filterOptions={(options: TOptions[]) => { return options }}
        value={value}
        renderInput={
            params => <TextField
                {...params}
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => handleChange(e.target.value as string)}
                fullWidth
                InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                        <React.Fragment>
                            {loading ? <CircularProgress color="primary" size={20} /> : null}
                            {autoCompleteProps.freeSolo && params.InputProps.endAdornment}
                        </React.Fragment>
                    ),
                    ...inputProps,
                }}
                {...renderInputProps}
            />
        }
        {...autoCompleteProps}
    />
}
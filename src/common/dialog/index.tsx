import './index.css';

import { DetailedHTMLProps, DialogHTMLAttributes, FC, ReactNode, useCallback, useRef } from 'react';
import Utils from '../utils';
import { CloseOutlinedIcon } from '../icons';
import { useMergedRef } from '../utils/components/hooks';

export type DialogProps = DetailedHTMLProps<DialogHTMLAttributes<HTMLDialogElement>, HTMLDialogElement> & {
	header?: ReactNode;
	message?: ReactNode;
	buttons?: ReactNode;
	showCloseButton?: boolean;
	autoFocusCloseButton?: boolean;
}

const DialogBase: FC<DialogProps> = ({ ref, showCloseButton, autoFocusCloseButton, className, children, ...props }) => {

	const dialogRef = useRef<HTMLDialogElement>(null);
	const mergedDialogRef = useMergedRef<HTMLDialogElement>(dialogRef, ref);

	const closeDialog = useCallback(() => {
		dialogRef.current?.close();
	}, []);

	return (
		<dialog
			{...props}
			ref={mergedDialogRef}
			className={Utils.joinClassNames('dialog-content', className)}
			closedby={props.closedby ?? 'any'}
		>
			{children}

			{showCloseButton === true ? (
				<button
					className='dialog-content-close-button'
					aria-label='Close dialog'
					autoFocus={autoFocusCloseButton}
					onClick={closeDialog}
					children={<CloseOutlinedIcon />}
				/>
			) : null}
		</dialog>
	);
}

export const Dialog: FC<DialogProps> = ({ header, message, buttons, children, ...props }) => {
	return (
		<DialogBase {...props}>
			<div className='dialog-content-group'>
				{typeof header === 'string' 
					? <h2 className='dialog-header' children={header} />
					: typeof header === 'object'
					? header
					: null
				}
				
				{typeof message === 'string'
					? <p className='dialog-message' children={message} />
					: typeof message === 'object'
					? message
					: null
				}

				{children}

				{buttons 
					? <div className='dialog-buttons-group' children={buttons}/>
					: null
				}
			</div>
		</DialogBase>
	);
}
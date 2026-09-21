import Utils from '../utils';
import './index.css';

import { ButtonHTMLAttributes, DetailedHTMLProps, FC, PropsWithChildren, ReactNode } from 'react';

export type ButtonProps = DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
    color?: 'primary' | 'secondary';
    variant?: 'contained' | 'outlined' | 'filled' | 'text';
    icon?: ReactNode;
}

export const Button: FC<ButtonProps> = ({ color, variant, className, icon, children, ...props }) => {

    const colorClassName = ({
        'primary': 'button-primary',
        'secondary': 'button-secondary',
    })[color ?? 'primary'];

    const variantClassName = ({
        'contained': 'button-contained',
        'outlined': 'button-outlined',
        'filled': 'button-filled',
        'text': 'button-text',
    } satisfies {[key in Exclude<ButtonProps['variant'], undefined>]: string})[variant ?? 'contained'];

    const hasIcon = icon !== null && icon !== undefined;
    const hasChildren = children !== null && children !== undefined;

    return (
        <button 
            {...props} 
            className={Utils.joinClassNames('button', colorClassName, variantClassName, hasIcon ? 'button-with-icon' : null, hasChildren ? 'button-with-children' : null, className)}
            children={
                hasIcon && hasChildren
                ? (<><div children={icon} /><div children={children} /></>)
                : hasIcon
                ? icon
                : hasChildren
                ? children
                : undefined
            }
        />
    );
}
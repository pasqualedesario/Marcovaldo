import './styles.css';
import { createState } from './app/state';
import { mountApp } from './app/ui';

mountApp(createState());

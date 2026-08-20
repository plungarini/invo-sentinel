export interface IconProps {
	className?: string;
	strokeWidth?: number;
}

export function HomeIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M9.07874 16.1354H14.8937"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M2.40002 13.713C2.40002 8.082 3.01402 8.475 6.31902 5.41C7.76502 4.246 10.015 2 11.958 2C13.9 2 16.195 4.235 17.654 5.41C20.959 8.475 21.572 8.082 21.572 13.713C21.572 22 19.613 22 11.986 22C4.35903 22 2.40002 22 2.40002 13.713Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function ActivityIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M6.91711 14.8539L9.91011 10.9649L13.3241 13.6449L16.2531 9.86487"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M19.6671 2.34998C20.7291 2.34998 21.5891 3.20998 21.5891 4.27198C21.5891 5.33298 20.7291 6.19398 19.6671 6.19398C18.6051 6.19398 17.7451 5.33298 17.7451 4.27198C17.7451 3.20998 18.6051 2.34998 19.6671 2.34998Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M20.7555 9.26898C20.8885 10.164 20.9495 11.172 20.9495 12.303C20.9495 19.241 18.6375 21.553 11.6995 21.553C4.76246 21.553 2.44946 19.241 2.44946 12.303C2.44946 5.36598 4.76246 3.05298 11.6995 3.05298C12.8095 3.05298 13.8005 3.11198 14.6825 3.23998"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function WalletIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M21.1712 14.6755H17.2845C15.8693 14.6755 14.7217 13.5279 14.7217 12.1117C14.7217 10.6964 15.8693 9.54883 17.2845 9.54883H21.1407"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M17.7221 12.0532H17.4249"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7.6062 8.14367H11.6662"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M2.71411 12.2532C2.71411 5.8484 5.03887 3.71411 12.0151 3.71411C18.9903 3.71411 21.3151 5.8484 21.3151 12.2532C21.3151 18.657 18.9903 20.7922 12.0151 20.7922C5.03887 20.7922 2.71411 18.657 2.71411 12.2532Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function WrenchToolIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M10.1347 9.75401L10.5985 7.64895C10.6352 7.48231 10.5844 7.30846 10.4638 7.18781L6.91585 3.63986C9.42138 2.44324 12.4091 2.95585 14.3725 4.91921C16.3358 6.88258 16.8484 9.87029 15.6518 12.3758L20.3215 17.0455C21.2262 17.9502 21.2262 19.4169 20.3215 20.3215C19.4169 21.2262 17.9502 21.2262 17.0455 20.3215L12.3758 15.6518C9.8703 16.8484 6.88258 16.3358 4.91921 14.3725C2.95585 12.4091 2.44324 9.42138 3.63986 6.91585L7.18781 10.4638C7.30846 10.5844 7.48231 10.6352 7.64895 10.5985L9.75401 10.1347C9.94423 10.0928 10.0928 9.94423 10.1347 9.75401Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function RestartIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M18.3646 5.63672L16.6434 7.3579M5.63672 18.3647L7.3579 16.6425M18.3646 18.3647L16.6434 16.6425M5.63672 5.63672L7.3579 7.3579"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M12 3V5.43437M12 21V18.5656M21 12H18.5656M3 12H5.43437"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function HeartRateIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M7.02811 3.28516H16.9709C19.1961 3.28516 21 5.08905 21 7.31424V12.7707C21 14.9959 19.1961 16.7998 16.9709 16.7998H7.02811C4.80389 16.7998 3 14.9959 3 12.7707V7.31424C3 5.08905 4.80389 3.28516 7.02811 3.28516Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7.05469 20.7188H16.943"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M9.88339 16.7969L9.24609 20.7141"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M14.1152 16.7969L14.7525 20.7141"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M6.73242 10.5028H9.43145L10.5027 7.29688L12.4486 13.1221L14.2613 9.09882L15.0961 10.5028H17.2639"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function KeyIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M15.7844 9.48354C15.8154 10.4785 15.6194 11.4136 15.2494 12.2566L19.9324 16.9395C20.6114 17.6275 20.9994 18.5546 20.9994 19.5246V19.9785C20.9994 20.6915 20.4214 21.2705 19.7074 21.2705H17.3524C16.6384 21.2705 16.0604 20.6915 16.0604 19.9785C16.0604 19.2785 15.5034 18.7065 14.8034 18.6875L14.7234 18.6855C14.0134 18.6655 13.4534 18.0786 13.4674 17.3686L13.4854 16.4285L12.3914 15.3346C11.1584 15.9956 9.66936 16.2655 8.11536 15.9585C5.57136 15.4575 3.53537 13.3755 3.09737 10.8205C2.38937 6.70352 5.64036 3.13551 9.66436 3.30251C12.9564 3.43851 15.6804 6.19154 15.7844 9.48354Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M10.9285 9.69226C10.9285 8.84426 10.2415 8.15625 9.39247 8.15625C8.54347 8.15625 7.85547 8.84426 7.85547 9.69226C7.85547 10.5413 8.54347 11.2293 9.39247 11.2293C10.2415 11.2293 10.9285 10.5413 10.9285 9.69226Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function InboxDownIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M7.87097 3.37891C4.99348 3.37891 3.18945 5.4163 3.18945 8.2995V16.0795C3.18945 18.9627 4.98491 21.0001 7.87097 21.0001H16.1272C19.0142 21.0001 20.8106 18.9627 20.8106 16.0795V8.2995C20.8106 5.4163 19.0142 3.37891 16.1282 3.37891"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M20.8032 13.3105H16.6094C15.7407 13.3105 14.9482 13.802 14.5625 14.5802C14.0948 15.5222 13.1223 16.1709 11.9983 16.1709C10.8744 16.1709 9.90189 15.5222 9.43421 14.5802C9.04845 13.802 8.25597 13.3105 7.3873 13.3105H3.19727"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M14.9364 7.56641L12.1894 10.2163L9.44336 7.56641"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M12.1895 10.2133V3"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function InboxUpIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M16.9904 3.44922C19.3616 3.82062 20.8091 5.72524 20.8091 8.29647V16.0768C20.8091 18.9623 19.0093 21.0003 16.1238 21.0003H7.86724C4.98175 21.0003 3.19141 18.9623 3.19141 16.0768V8.29647C3.19141 5.71571 4.63892 3.8111 7.01016 3.44922"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M9.25586 5.64932L12.0023 3L14.7478 5.64932"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M12 3.00391V10.2157"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M20.8017 13.3086H16.6087C15.7402 13.3086 14.9479 13.8 14.5622 14.578C14.0946 15.5199 13.1223 16.1684 11.9986 16.1684C10.8748 16.1684 9.90252 15.5199 9.43494 14.578C9.04925 13.8 8.25693 13.3086 7.38842 13.3086H3.19922"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function ReceiptEditIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M10.2268 20.5903L8.10183 19.7224C7.63967 19.5337 7.11913 19.5492 6.66962 19.7643L5.91654 20.1243C5.12357 20.5047 4.20704 19.9258 4.20801 19.0482L4.21677 6.89188C4.21677 4.48962 5.5546 3 7.95297 3H15.1928C17.598 3 18.9057 4.48962 18.9057 6.89188V11.0854"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M13.6139 8.90625H8.75781M11.9949 12.6784H8.75781"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M15.185 20.8467L14.3511 20.9868C13.7401 21.089 13.2011 20.5801 13.2672 19.9642L13.3606 19.1031C13.4054 18.6887 13.5796 18.2975 13.8578 17.9862L17.0385 14.4728C17.4675 14.0087 18.1924 13.9804 18.6565 14.4105L19.4232 15.1208C19.8873 15.5498 19.9155 16.2747 19.4865 16.7388L16.3457 20.2075C16.0421 20.5461 15.6335 20.7718 15.185 20.8467Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function BarChartAiIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M7.33398 9.74304L7.33398 17.0661M11.5337 15.0378V17.0659M15.6651 13.166V17.0656"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M11.8009 3.5H7.3662C4.42685 3.5 2.58307 5.58119 2.58307 8.52735V16.4736C2.58307 19.4198 4.4181 21.5 7.3662 21.5H15.7999C18.749 21.5 20.5831 19.4198 20.5831 16.4736V13.5274"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M17.9874 8.6991L18.0884 8.42572C18.4693 7.39493 19.2808 6.5822 20.3101 6.20077L20.583 6.09962L20.3101 5.99846C19.2808 5.61703 18.4693 4.80431 18.0884 3.77351L17.9874 3.50011L17.8864 3.77351C17.5055 4.80431 16.694 5.61703 15.6647 5.99846L15.3917 6.09962L15.6647 6.20077C16.694 6.5822 17.5055 7.39493 17.8864 8.42572L17.9874 8.6991Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M12.6767 9.94116C12.8483 9.3765 13.2895 8.93458 13.8533 8.76271C13.2895 8.59085 12.8483 8.14893 12.6767 7.58426C12.5051 8.14893 12.0638 8.59085 11.5 8.76271C12.0638 8.93458 12.5051 9.3765 12.6767 9.94116Z"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function SettingsIcon({ className = 'h-5 w-5', strokeWidth = 1.5 }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg">
			<g
				id="Iconly/Light/Setting"
				stroke="none"
				strokeWidth={strokeWidth}
				fill="none"
				fillRule="evenodd"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<g transform="translate(2.500000, 1.500000)" stroke="currentColor" strokeWidth={strokeWidth}>
					<path
						d="M18.3066362,6.12356982 L17.6842106,5.04347829 C17.1576365,4.12955711 15.9906873,3.8142761 15.0755149,4.33867279 L15.0755149,4.33867279 C14.6398815,4.59529992 14.1200613,4.66810845 13.6306859,4.54104256 C13.1413105,4.41397667 12.7225749,4.09747295 12.4668193,3.66132725 C12.3022855,3.38410472 12.2138742,3.06835005 12.2105264,2.74599544 L12.2105264,2.74599544 C12.2253694,2.22917739 12.030389,1.72835784 11.6700024,1.3576252 C11.3096158,0.986892553 10.814514,0.777818938 10.2974829,0.778031878 L9.04347831,0.778031878 C8.53694532,0.778031878 8.05129106,0.97987004 7.69397811,1.33890085 C7.33666515,1.69793166 7.13715288,2.18454839 7.13958814,2.69107553 L7.13958814,2.69107553 C7.12457503,3.73688099 6.27245786,4.57676682 5.22654465,4.57665906 C4.90419003,4.57331126 4.58843537,4.48489995 4.31121284,4.32036615 L4.31121284,4.32036615 C3.39604054,3.79596946 2.22909131,4.11125048 1.70251717,5.02517165 L1.03432495,6.12356982 C0.508388616,7.03634945 0.819378585,8.20256183 1.72997713,8.73226549 L1.72997713,8.73226549 C2.32188101,9.07399614 2.68650982,9.70554694 2.68650982,10.3890161 C2.68650982,11.0724852 2.32188101,11.704036 1.72997713,12.0457667 L1.72997713,12.0457667 C0.820534984,12.5718952 0.509205679,13.7352837 1.03432495,14.645309 L1.03432495,14.645309 L1.6659039,15.7345539 C1.9126252,16.1797378 2.3265816,16.5082503 2.81617164,16.6473969 C3.30576167,16.7865435 3.83061824,16.7248517 4.27459956,16.4759726 L4.27459956,16.4759726 C4.71105863,16.2212969 5.23116727,16.1515203 5.71931837,16.2821523 C6.20746948,16.4127843 6.62321383,16.7330005 6.87414191,17.1716248 C7.03867571,17.4488473 7.12708702,17.764602 7.13043482,18.0869566 L7.13043482,18.0869566 C7.13043482,19.1435014 7.98693356,20.0000001 9.04347831,20.0000001 L10.2974829,20.0000001 C11.3504633,20.0000001 12.2054882,19.1490783 12.2105264,18.0961099 L12.2105264,18.0961099 C12.2080776,17.5879925 12.4088433,17.0999783 12.7681408,16.7406809 C13.1274382,16.3813834 13.6154524,16.1806176 14.1235699,16.1830664 C14.4451523,16.1916732 14.7596081,16.2797208 15.0389017,16.4393593 L15.0389017,16.4393593 C15.9516813,16.9652957 17.1178937,16.6543057 17.6475973,15.7437072 L17.6475973,15.7437072 L18.3066362,14.645309 C18.5617324,14.2074528 18.6317479,13.6859659 18.5011783,13.1963297 C18.3706086,12.7066935 18.0502282,12.2893121 17.6109841,12.0366133 L17.6109841,12.0366133 C17.17174,11.7839145 16.8513595,11.3665332 16.7207899,10.876897 C16.5902202,10.3872608 16.6602358,9.86577384 16.9153319,9.42791767 C17.0812195,9.13829096 17.3213574,8.89815312 17.6109841,8.73226549 L17.6109841,8.73226549 C18.5161253,8.20284891 18.8263873,7.04344892 18.3066362,6.13272314 L18.3066362,6.13272314 L18.3066362,6.12356982 Z"
						id="Path_33946"
					></path>
					<circle id="Ellipse_737" cx="9.67505726" cy="10.3890161" r="2.63615562"></circle>
				</g>
			</g>
		</svg>
	);
}
